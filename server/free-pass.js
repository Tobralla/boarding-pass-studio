import JSZip from 'jszip';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {X509Certificate} from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {passJSON,createBundle,templates} from './pass.js';
import {passTheme} from '../shared/theme.js';
import {verifyPkpass} from '../scripts/verify-pkpass.mjs';
import {requestSignedPass,FreeSigningError} from './wallet-service.js';
const rootFingerprints=new Set(['B0B1730ECBC7FF4505142C49F1295E6EDA6BCAED7E2C68C5BE91B5A11001F024','C2B9B042DD57830E7D117DAC55AC8AE19407D38E41D88F3215BC3A890444A050','63343ABFB89A6A03EBB57E9B3F5FA7BE7C4F5C756F3017B3A8C488C3653E9179']);
let rootsPromise;
export function appleRoots(){
 rootsPromise||=readFile(new URL('./apple-roots.crt',import.meta.url),'utf8').then(pem=>{
  const certs=pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)||[];
  if(!certs.length)throw new Error('Missing Apple roots');
  for(const certificate of certs)assert.ok(rootFingerprints.has(new X509Certificate(certificate).fingerprint256.replaceAll(':','')),'Unexpected root certificate');
  return pem;
 });
 return rootsPromise;
}
export async function freePassArguments(data){
 const pass=passJSON(data),theme=passTheme(templates[data.template],data.color);
 // The provider uses Latin-1 for its QR encoding; escape generated JSON to ASCII.
 const message=data.barcode||pass.barcodes[0].message.replace(/[\u0080-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
 if([...message].some(c=>c.codePointAt(0)>255))throw new FreeSigningError('Custom barcode text contains characters the free signing service cannot encode.',400);
 const bundle=await JSZip.loadAsync(await createBundle(data,false));
 const logo=await bundle.file('logo.png').async('nodebuffer'),icon=await bundle.file('icon.png').async('nodebuffer');
 return {
  style:'boardingPass',transit_type:'Air',organization_name:pass.organizationName,description:pass.description,serial_number:pass.serialNumber,
  background_color:theme.background,foreground_color:theme.foreground,label_color:theme.accent,
  barcode_message:message,barcode_format:'QR',logo_png_b64:logo.toString('base64'),icon_png_b64:icon.toString('base64'),
  header_fields:pass.boardingPass.headerFields,primary_fields:pass.boardingPass.primaryFields,secondary_fields:pass.boardingPass.secondaryFields,auxiliary_fields:pass.boardingPass.auxiliaryFields,back_fields:pass.boardingPass.backFields,
 };
}
export async function createFreePass(data,{request=requestSignedPass,trustedRootsPem}={}){
 const args=await freePassArguments(data);
 const roots=trustedRootsPem||await appleRoots();
 const bytes=await request(args);
 const folder=await mkdtemp(join(tmpdir(),'passport-free-pass-'));
 try{
  const {pass}=await verifyPkpass(bytes,{folder,trustedRootsPem:roots,expected:{serialNumber:args.serial_number,organizationName:args.organization_name,description:args.description}});
  assert.equal(pass.boardingPass?.transitType,'PKTransitTypeAir');
  for(const [key,expected] of Object.entries({headerFields:args.header_fields,primaryFields:args.primary_fields,secondaryFields:args.secondary_fields,auxiliaryFields:args.auxiliary_fields,backFields:args.back_fields}))assert.deepEqual(pass.boardingPass[key],expected,`${key} changed`);
  for(const [key,hex] of Object.entries({backgroundColor:args.background_color,foregroundColor:args.foreground_color,labelColor:args.label_color}))assert.equal(pass[key]?.replace(/\s/g,''),`rgb(${hex.slice(1).match(/../g).map(x=>parseInt(x,16)).join(',')})`,`${key} changed`);
  const barcode=pass.barcodes?.[0]||pass.barcode;
  assert.equal(barcode?.message,args.barcode_message);assert.equal(barcode?.format,'PKBarcodeFormatQR');
  assert.ok(!barcode.altText,'Unexpected barcode caption');
  const zip=await JSZip.loadAsync(bytes);
  assert.ok(zip.file('logo.png'),'Missing airline logo');
  const actual=await sharp(await zip.file('logo.png').async('nodebuffer')).ensureAlpha().raw().toBuffer();
  const expected=await sharp(Buffer.from(args.logo_png_b64,'base64')).ensureAlpha().raw().toBuffer();
  assert.ok(actual.equals(expected),'Airline logo changed');
  return bytes;
 }catch{
  throw new FreeSigningError('The signing service returned a pass that failed verification. Try again later.');
 }finally{await rm(folder,{recursive:true,force:true});}
}
