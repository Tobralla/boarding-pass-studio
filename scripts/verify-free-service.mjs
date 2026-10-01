import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {systemAppleRoots,verifyPkpass} from './verify-pkpass.mjs';
import {requestSignedPass} from '../server/wallet-service.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const folder=join(root,'verification');
const reportPath=join(folder,'report.json');
const endpoint='https://walletmcppass.com/mcp';
await mkdir(folder,{recursive:true});
const report={service:endpoint,time:new Date().toISOString(),status:'running',walletInstallation:'not-tested'};
await writeFile(reportPath,JSON.stringify(report,null,2));
try{
 const appleRoots=await systemAppleRoots();
 console.log('1/5 Connecting to free signing service…');
 console.log('2/5 Generating an anonymous boarding pass with a custom logo and color…');
 const logo=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="40"><text x="3" y="30" fill="white" font-family="Arial" font-size="27" font-weight="bold">TEST AIR</text></svg>')).png().toBuffer();
 const icon=await sharp({create:{width:29,height:29,channels:4,background:'#223344'}}).png().toBuffer();
 const args={style:'boardingPass',transit_type:'Air',organization_name:'PassPort Verification',description:'Anonymous test boarding pass',background_color:'#223344',foreground_color:'#ffffff',label_color:'#c9d7ee',barcode_message:'PASSPORT-VERIFICATION-ONLY',barcode_format:'QR',logo_png_b64:logo.toString('base64'),icon_png_b64:icon.toString('base64'),primary_fields:[{key:'origin',label:'COPENHAGEN',value:'CPH'},{key:'destination',label:'LONDON',value:'LHR'}],secondary_fields:[{key:'boarding',label:'BOARDS',value:'8:00 PM'},{key:'flight',label:'FLIGHT',value:'TEST 100'},{key:'seat',label:'SEAT',value:'1A'},{key:'group',label:'GROUP',value:'1'}],auxiliary_fields:[{key:'passenger',label:'PASSENGER',value:'ALEX EXAMPLE'},{key:'class',label:'CLASS',value:'First'}],header_fields:[{key:'gate',label:'GATE',value:'B1'}]};
 console.log('3/5 Requesting and downloading the signed .pkpass…');
 const bytes=await requestSignedPass(args);
 const passPath=join(folder,'free-test.pkpass');await writeFile(passPath,bytes);
 console.log('4/5 Verifying the manifest, signature, Apple trust chain, identity, and certificate dates…');
 const verified=await verifyPkpass(bytes,{folder:join(folder,'checks'),trustedRootsPem:appleRoots,expected:{}});
 if(verified.pass.backgroundColor?.replace(/\s/g,'')!=='rgb(34,51,68)')throw new Error('Service did not preserve the custom color.');
 if(verified.pass.boardingPass?.transitType!=='PKTransitTypeAir')throw new Error('Service did not produce a boarding pass.');
 for(const field of [...args.primary_fields,...args.secondary_fields,...args.auxiliary_fields,...args.header_fields]){
 const all=['primaryFields','secondaryFields','auxiliaryFields','headerFields'].flatMap(key=>verified.pass.boardingPass[key]||[]);
 if(!all.some(actual=>actual.key===field.key&&actual.value===field.value))throw new Error(`Service did not preserve the ${field.key} field.`);
 }
 if(verified.pass.barcodes?.[0]?.message!=='PASSPORT-VERIFICATION-ONLY'&&verified.pass.barcode?.message!=='PASSPORT-VERIFICATION-ONLY')throw new Error('Service changed the QR payload.');
 const JSZip=(await import('jszip')).default;const zip=await JSZip.loadAsync(bytes);
 if(!zip.file('logo.png'))throw new Error('Service did not include the custom logo.');
 const png=await sharp(await zip.file('logo.png').async('nodebuffer')).metadata();
 if(png.format!=='png')throw new Error('Custom logo is not a valid PNG.');
 const actualLogo=await sharp(await zip.file('logo.png').async('nodebuffer')).ensureAlpha().raw().toBuffer();
 const expectedLogo=await sharp(logo).ensureAlpha().raw().toBuffer();
 if(!actualLogo.equals(expectedLogo))throw new Error('Service did not preserve the custom logo pixels.');
 Object.assign(report,{status:'verified-cryptographically',checks:verified.checks,passFile:passPath,passTypeIdentifier:verified.pass.passTypeIdentifier,signer:verified.signer,customLogo:true,customColor:true,boardingFields:true});
 await writeFile(reportPath,JSON.stringify(report,null,2));
 console.log(`5/5 VERIFIED: free service generated a signed boarding pass with an Apple-rooted certificate.\nCertificate valid until: ${verified.signer.validUntil}\nPass saved: ${passPath}\nReport saved: ${reportPath}\n\nFinal device check: AirDrop free-test.pkpass to an iPhone and add it to Wallet.`);
}catch(error){
 const reason=error.cause?.code?`${error.message} (${error.cause.code})`:error.message;
 Object.assign(report,{status:'failed',error:reason});await writeFile(reportPath,JSON.stringify(report,null,2));
 console.error(`\nNOT VERIFIED: ${reason}\nReport saved: ${reportPath}`);process.exitCode=1;
}
