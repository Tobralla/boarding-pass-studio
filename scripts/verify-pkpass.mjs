import JSZip from 'jszip';
import forge from 'node-forge';
import {createHash} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';

export async function systemAppleRoots(){
 const result=spawnSync('/usr/bin/security',['find-certificate','-a','-c','Apple Root','-p','/System/Library/Keychains/SystemRootCertificates.keychain'],{encoding:'utf8',timeout:10000});
 if(result.status===0&&result.stdout.includes('BEGIN CERTIFICATE'))return result.stdout;
 const urls=['https://www.apple.com/appleca/AppleIncRootCertificate.cer','https://www.apple.com/certificateauthority/AppleRootCA-G2.cer','https://www.apple.com/certificateauthority/AppleRootCA-G3.cer'];
 const roots=await Promise.all(urls.map(async url=>{
  const response=await fetch(url,{signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!response.ok)throw new Error(`Cannot download Apple root certificate: HTTP ${response.status}`);
  const converted=spawnSync('openssl',['x509','-inform','DER','-outform','PEM'],{input:Buffer.from(await response.arrayBuffer()),encoding:'utf8',timeout:10000});
  if(converted.status!==0)throw new Error('Cannot decode Apple root certificate.');
  return converted.stdout;
 }));
 return roots.join('\n');
}
export async function verifyPkpass(bytes,{folder,trustedRootsPem,expected={}}){
 await mkdir(folder,{recursive:true});
 const zip=await JSZip.loadAsync(bytes,{checkCRC32:true});
 for(const file of ['pass.json','manifest.json','signature','icon.png'])assert.ok(zip.file(file),`Missing ${file}`);
 const manifestBytes=await zip.file('manifest.json').async('nodebuffer');
 const manifest=JSON.parse(manifestBytes.toString('utf8'));
 const files=Object.keys(zip.files).filter(name=>!zip.files[name].dir&&name!=='manifest.json'&&name!=='signature');
 assert.deepEqual(Object.keys(manifest).sort(),files.sort(),'Manifest must cover every bundled file');
 for(const [name,hash] of Object.entries(manifest)){
  assert.ok(!name.includes('..')&&!name.startsWith('/'),'Invalid manifest path');
  assert.match(hash,/^[a-f0-9]{40}$/i,'Manifest must use SHA-1');
  assert.equal(createHash('sha1').update(await zip.file(name).async('nodebuffer')).digest('hex'),hash.toLowerCase(),`Hash mismatch: ${name}`);
 }
 const pass=JSON.parse(await zip.file('pass.json').async('string'));
 assert.equal(pass.formatVersion,1);
 assert.match(pass.passTypeIdentifier,/^pass\./);
 assert.ok(pass.teamIdentifier&&pass.serialNumber&&pass.organizationName&&pass.description,'Missing required pass properties');
 for(const [name,value] of Object.entries(expected))assert.deepEqual(pass[name],value,`Unexpected pass field: ${name}`);
 const signature=join(folder,'signature.der'),manifestPath=join(folder,'manifest.json'),roots=join(folder,'trusted-roots.pem'),signer=join(folder,'signer.pem');
 await Promise.all([writeFile(signature,await zip.file('signature').async('nodebuffer')),writeFile(manifestPath,manifestBytes),writeFile(roots,trustedRootsPem)]);
 const opensslVersion=spawnSync('openssl',['version'],{encoding:'utf8',timeout:10000}).stdout||'';
 const verified=spawnSync('openssl',['cms','-verify','-binary','-inform','DER','-in',signature,'-content',manifestPath,'-CAfile',roots,'-no-CApath',...(/^OpenSSL [3-9]\./.test(opensslVersion)?['-no-CAstore']:[]),'-purpose','any','-signer',signer,'-out',join(folder,'verified-manifest.json')],{encoding:'utf8',timeout:15000});
 if(verified.status!==0)throw new Error(`Signature or certificate-chain verification failed: ${verified.stderr?.trim()||verified.error?.message}`);
 const cert=forge.pki.certificateFromPem(await readFile(signer,'utf8'));
 assert.equal(cert.subject.getField({type:'0.9.2342.19200300.100.1.1'})?.value,pass.passTypeIdentifier,'Signing certificate does not match Pass Type ID');
 assert.equal(cert.subject.getField('OU')?.value,pass.teamIdentifier,'Signing certificate does not match Team ID');
 assert.ok(cert.validity.notBefore<=new Date()&&cert.validity.notAfter>=new Date(),'Signing certificate is expired or not yet valid');
 return {pass,checks:{manifest:true,signature:true,trustedChain:true,identity:true,certificateDates:true},signer:{subject:cert.subject.getField('CN')?.value,validUntil:cert.validity.notAfter.toISOString()},files};
}
