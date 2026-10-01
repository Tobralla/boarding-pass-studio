import {test} from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import sharp from 'sharp';
import forge from 'node-forge';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createBundle,passJSON,templates,validatePass} from './pass.js';
import {verifyPkpass} from '../scripts/verify-pkpass.mjs';
import {readFile} from 'node:fs/promises';
const pass={template:'united',name:'Ryan Ariano',cabin:'First',from:{code:'DEN',city:'Denver'},to:{code:'JAC',city:'Jackson Hole'},date:'2026-10-15',boardingTime:'19:25',flight:'UA 1846',seat:'11A',gate:'B82',group:'2',barcode:''};
test('all five templates export valid JSON, images, and exact manifest hashes',async()=>{
 for(const template of Object.keys(templates)){
 const zip=await JSZip.loadAsync(await createBundle({...pass,template}));
 const json=JSON.parse(await zip.file('pass.json').async('string'));
 assert.equal(json.boardingPass.primaryFields[0].value,'DEN');
 assert.equal(json.boardingPass.auxiliaryFields[1].value,'First');
 assert.equal(json.backgroundColor,`rgb(${templates[template].color.match(/\w\w/g).map(x=>parseInt(x,16)).join(', ')})`);
 const manifest=JSON.parse(await zip.file('manifest.json').async('string'));
 assert.ok(zip.file('README.txt'));assert.ok(!zip.file('signature'));
 assert.deepEqual(Object.keys(manifest).sort(),Object.keys(zip.files).filter(n=>n!=='manifest.json').sort());
 for(const [name,hash] of Object.entries(manifest))assert.equal(hash,createHash('sha1').update(await zip.file(name).async('nodebuffer')).digest('hex'));
 const icon=await sharp(await zip.file('icon@3x.png').async('nodebuffer')).metadata();assert.equal(icon.width,87);
 const logo=await sharp(await zip.file('logo@3x.png').async('nodebuffer')).metadata();assert.ok(logo.width>0&&logo.height<=96);
 }
});
test('rejects incomplete details, invalid dates, same-airport routes, and oversized barcode',()=>{
 for(const p of [{...pass,name:''},{...pass,from:{code:'NO',city:'Test'}},{...pass,to:pass.from},{...pass,cabin:'Invalid'},{...pass,boardingTime:'25:80'},{...pass,date:'2026-02-31'},{...pass,barcode:'x'.repeat(1001)},{...pass,color:'red'}])assert.throws(()=>validatePass(p));
});
test('custom barcode is preserved and generated QR has no visible caption',()=>{
 assert.equal(passJSON({...pass,barcode:'my-payload'}).barcodes[0].message,'my-payload');
 assert.equal(passJSON(pass).barcodes[0].altText,undefined);
 assert.ok(passJSON(pass).barcodes[0].message.startsWith('PASSPORT-DEMO:'));
});
test('custom colors reach export while airline base colors stay unchanged',()=>{
 const custom=passJSON({...pass,color:'#f1f1f1'});
 assert.equal(custom.backgroundColor,'rgb(241, 241, 241)');
 assert.equal(custom.foregroundColor,'rgb(23, 23, 23)');
 assert.equal(custom.labelColor,'rgb(23, 23, 23)');
 const base=passJSON(pass);
 assert.equal(base.backgroundColor,'rgb(8, 60, 166)');
 assert.equal(base.foregroundColor,'rgb(255, 255, 255)');
});
test('signed export has a verifiable detached signature and matching identity',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'passport-signing-test-'));
 const keys=forge.pki.rsa.generateKeyPair(2048);
 const makeCert=(attrs,serial)=>{const cert=forge.pki.createCertificate();cert.publicKey=keys.publicKey;cert.serialNumber=serial;cert.validity.notBefore=new Date(Date.now()-1000);cert.validity.notAfter=new Date(Date.now()+86400000);cert.setSubject(attrs);cert.setIssuer(attrs);cert.sign(keys.privateKey,forge.md.sha256.create());return forge.pki.certificateToPem(cert);};
 const attrs=[{name:'commonName',value:'Test signing certificate'},{name:'organizationalUnitName',value:'TESTTEAM01'},{type:'0.9.2342.19200300.100.1.1',value:'pass.com.test.passport'}];
 const env={PASS_TYPE_IDENTIFIER:'pass.com.test.passport',TEAM_IDENTIFIER:'TESTTEAM01',PASS_CERT_PATH:join(folder,'cert.pem'),PASS_KEY_PATH:join(folder,'key.pem'),WWDR_CERT_PATH:join(folder,'wwdr.pem'),PASS_KEY_PASSPHRASE:''};
 const previous=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));
 try{
 await writeFile(env.PASS_CERT_PATH,makeCert(attrs,'01'));await writeFile(env.PASS_KEY_PATH,forge.pki.privateKeyToPem(keys.privateKey));await writeFile(env.WWDR_CERT_PATH,makeCert([{name:'commonName',value:'Mock intermediate'}],'02'));Object.assign(process.env,env);
 const signedBytes=await createBundle(pass,true);
 const zip=await JSZip.loadAsync(signedBytes);assert.ok(zip.file('signature'));assert.ok(!zip.file('README.txt'));
 await writeFile(join(folder,'signature'),await zip.file('signature').async('nodebuffer'));await writeFile(join(folder,'manifest.json'),await zip.file('manifest.json').async('nodebuffer'));
 const verified=spawnSync('openssl',['cms','-verify','-binary','-inform','DER','-in',join(folder,'signature'),'-content',join(folder,'manifest.json'),'-noverify'],{encoding:'utf8'});assert.equal(verified.status,0,verified.stderr);
 const checked=await verifyPkpass(signedBytes,{folder:join(folder,'verified'),trustedRootsPem:await readFile(env.PASS_CERT_PATH,'utf8')});
 assert.equal(checked.checks.signature,true);assert.equal(checked.checks.trustedChain,true);
 const wrongRoot=makeCert([{name:'commonName',value:'Untrusted root'}],'03');
 // This uses the same key but a different issuer DN and certificate; it must not be accepted.
 await assert.rejects(()=>verifyPkpass(signedBytes,{folder:join(folder,'untrusted'),trustedRootsPem:wrongRoot}),/verification failed/);
 const modified=JSON.parse(await zip.file('pass.json').async('string'));modified.organizationName='Changed after signing';zip.file('pass.json',JSON.stringify(modified));
 const tamperedBytes=await zip.generateAsync({type:'nodebuffer'});
 await assert.rejects(()=>verifyPkpass(tamperedBytes,{folder:join(folder,'tampered'),trustedRootsPem:checked.signer.subject}),/Hash mismatch/);
 process.env.TEAM_IDENTIFIER='WRONGTEAM';await assert.rejects(()=>createBundle(pass,true),/does not match/);
 }finally{for(const [k,v] of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v;}await rm(folder,{recursive:true,force:true});}
});
