import JSZip from 'jszip';
import sharp from 'sharp';
import forge from 'node-forge';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {passTheme} from '../shared/theme.js';

import {templates,validatePass,passJSON as buildPassJSON} from '../shared/pass-data.js';
export {templates,validatePass};
export const passJSON=data=>buildPassJSON(data,{passTypeIdentifier:process.env.PASS_TYPE_IDENTIFIER,teamIdentifier:process.env.TEAM_IDENTIFIER});
export function signingConfig() {
 const keys=['PASS_TYPE_IDENTIFIER','TEAM_IDENTIFIER','PASS_CERT_PATH','PASS_KEY_PATH','WWDR_CERT_PATH'];
 return {ready:keys.every(k=>!!process.env[k]), missing:keys.filter(k=>!process.env[k])};
}
export async function createBundle(data, signed=false) {
 const pass=passJSON(data), t=templates[data.template], theme=passTheme(t,data.color);
 const zip=new JSZip();
 const ink=theme.foreground;
 const iconSvg=`<svg width="96" height="96" xmlns="http://www.w3.org/2000/svg"><rect width="96" height="96" rx="20" fill="${theme.background}"/><path d="m19 53 23-9 13-25 7 2-5 22 19-5 6 7-28 9-13 22-7-2 6-17-17 5z" fill="${ink}"/></svg>`;
 zip.file('pass.json',JSON.stringify(pass,null,2));
 for (const [name,size] of [['icon.png',29],['icon@2x.png',58],['icon@3x.png',87]]) zip.file(name,await sharp(Buffer.from(iconSvg)).resize(size,size).png().toBuffer());
 for (const [name,width] of [['logo.png',160],['logo@2x.png',320],['logo@3x.png',480]]) {
 const {data: pixels,info}=await sharp(fileURLToPath(new URL(`../public/logos/${data.template==='emirates'?'emirates-logo':data.template}.png`,import.meta.url))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 if(data.template!=='etihad'||theme.darkInk){const channels=ink.match(/\w\w/g).map(x=>parseInt(x,16));for(let i=0;i<pixels.length;i+=4){pixels[i]=channels[0];pixels[i+1]=channels[1];pixels[i+2]=channels[2];}}
 zip.file(name,await sharp(pixels,{raw:info}).resize({width:Math.round(width*.9),height:Math.round(width/5),fit:'inside'}).png().toBuffer());
 }
 if (!signed) zip.file('README.txt','PassPort template bundle\n\nThis ZIP is an unsigned Apple Wallet template. It cannot be added to Wallet until signed.\nReplace passTypeIdentifier and teamIdentifier in pass.json with your Apple Developer identifiers.\nUse an Apple Pass Type ID signing certificate, its private key, and the Apple WWDR certificate to sign manifest.json.\nThe manifest contains SHA-1 hashes of all bundled files except manifest.json and signature.\nAfter signing, package only pass.json, images, manifest.json, and signature into a .pkpass ZIP.\nThe demo QR is a design sample, not an airline-issued boarding credential.\n');
 const manifest={};
 for (const [name,file] of Object.entries(zip.files)) manifest[name]=createHash('sha1').update(await file.async('nodebuffer')).digest('hex');
 const manifestText=JSON.stringify(manifest);
 zip.file('manifest.json',manifestText);
 if (signed) {
  if (!signingConfig().ready) throw new Error('Apple Wallet signing is not configured.');
  const [cert,key,wwdr]=await Promise.all(['PASS_CERT_PATH','PASS_KEY_PATH','WWDR_CERT_PATH'].map(k=>readFile(process.env[k],'utf8')));
  const signingCert=forge.pki.certificateFromPem(cert);
  const uid=signingCert.subject.getField({type:'0.9.2342.19200300.100.1.1'})?.value;
  const team=signingCert.subject.getField('OU')?.value;
  if (uid!==pass.passTypeIdentifier || team!==pass.teamIdentifier) throw new Error('Signing certificate does not match the configured Pass Type ID and Team ID.');
  if (signingCert.validity.notAfter < new Date() || signingCert.validity.notBefore > new Date()) throw new Error('Signing certificate is not currently valid.');
  const privateKey=process.env.PASS_KEY_PASSPHRASE ? forge.pki.decryptRsaPrivateKey(key,process.env.PASS_KEY_PASSPHRASE) : forge.pki.privateKeyFromPem(key);
  if (!privateKey) throw new Error('Cannot unlock signing key. Check PASS_KEY_PASSPHRASE.');
  const p7=forge.pkcs7.createSignedData();
  p7.content=forge.util.createBuffer(manifestText,'utf8');
  p7.addCertificate(signingCert);p7.addCertificate(forge.pki.certificateFromPem(wwdr));
  p7.addSigner({key:privateKey,certificate:signingCert,digestAlgorithm:forge.pki.oids.sha256,authenticatedAttributes:[{type:forge.pki.oids.contentType,value:forge.pki.oids.data},{type:forge.pki.oids.messageDigest},{type:forge.pki.oids.signingTime,value:new Date()}]});
  p7.sign({detached:true});zip.file('signature',Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(),'binary'));
 }
 return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
