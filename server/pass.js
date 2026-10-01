import JSZip from 'jszip';
import sharp from 'sharp';
import forge from 'node-forge';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {passTheme} from '../shared/theme.js';

export const templates = {
 united: { name: 'United Airlines', brand: 'UNITED', color: '#083ca6', accent: '#e9ed9a', prefix: 'UA' },
 emirates: { name: 'Emirates', brand: 'Emirates', color: '#b82331', accent: '#f4dfbe', prefix: 'EK' },
 etihad: { name: 'Etihad Airways', brand: 'ETIHAD', color: '#202b2b', accent: '#d6b46d', prefix: 'EY' },
 klm: { name: 'KLM', brand: 'KLM', color: '#0086bd', accent: '#dcf6ff', prefix: 'KL' },
 singapore: { name: 'Singapore Airlines', brand: 'SINGAPORE AIRLINES', color: '#092e61', accent: '#ffb24a', prefix: 'SQ' },
};
const rgb = hex => `rgb(${hex.match(/\w\w/g).map(x => parseInt(x,16)).join(', ')})`;
export function validatePass(data) {
 if (!data || !templates[data.template]) throw new Error('Choose a valid template.');
 if(data.color!==undefined&&(typeof data.color!=='string'||!/^#[0-9a-f]{6}$/i.test(data.color)))throw new Error('Choose a valid pass color.');
 const required = { name:80, cabin:30, flight:12, seat:6, gate:8, boardingTime:5, date:10, group:4 };
 for (const [key,max] of Object.entries(required)) if (typeof data[key]!=='string' || !data[key].trim() || data[key].length>max) throw new Error(`Enter a valid ${key}.`);
 if (!['Economy','Premium Economy','Business','First'].includes(data.cabin)) throw new Error('Choose a valid cabin class.');
 if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.boardingTime)) throw new Error('Enter a valid boarding time.');
 if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || Number.isNaN(new Date(data.date+'T00:00:00Z').getTime()) || new Date(data.date+'T00:00:00Z').toISOString().slice(0,10)!==data.date) throw new Error('Enter a valid date.');
 for (const field of ['from','to']) if (!data[field] || !/^[A-Z]{3}$/.test(data[field].code) || typeof data[field].city!=='string' || !data[field].city || data[field].city.length>120) throw new Error('Select both airports from search results.');
 if (data.from.code===data.to.code) throw new Error('Choose two different airports.');
 if (data.barcode && (typeof data.barcode!=='string' || data.barcode.length>1000)) throw new Error('Barcode text must be under 1,000 characters.');
 return data;
}
export function signingConfig() {
 const keys=['PASS_TYPE_IDENTIFIER','TEAM_IDENTIFIER','PASS_CERT_PATH','PASS_KEY_PATH','WWDR_CERT_PATH'];
 return {ready:keys.every(k=>!!process.env[k]), missing:keys.filter(k=>!process.env[k])};
}
export function passJSON(data) {
 validatePass(data);
 const t=templates[data.template];
 const theme=passTheme(t,data.color);
 const time = new Date(`2000-01-01T${data.boardingTime}:00`).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
 return {
 formatVersion:1, passTypeIdentifier:process.env.PASS_TYPE_IDENTIFIER||'pass.com.example.passport', teamIdentifier:process.env.TEAM_IDENTIFIER||'TEAMIDHERE',
 serialNumber:randomUUID(), organizationName:'PassPort Studio', description:`${t.name} boarding pass template`,
 backgroundColor:rgb(theme.background), foregroundColor:rgb(theme.foreground), labelColor:rgb(theme.accent),
 barcodes:[{format:'PKBarcodeFormatQR',message:data.barcode||`PASSPORT-DEMO:${JSON.stringify({name:data.name,from:data.from.code,to:data.to.code,date:data.date,flight:data.flight,seat:data.seat})}`,messageEncoding:'utf-8'}],
 boardingPass:{transitType:'PKTransitTypeAir',headerFields:[{key:'gate',label:'GATE',value:data.gate.toUpperCase()}],
 primaryFields:[{key:'origin',label:data.from.city.toUpperCase(),value:data.from.code},{key:'destination',label:data.to.city.toUpperCase(),value:data.to.code}],
 secondaryFields:[{key:'boarding',label:'BOARDS',value:time},{key:'flight',label:'FLIGHT',value:data.flight.toUpperCase()},{key:'seat',label:'SEAT',value:data.seat.toUpperCase()},{key:'group',label:'GROUP',value:data.group}],
 auxiliaryFields:[{key:'passenger',label:'PASSENGER',value:data.name.toUpperCase()},{key:'class',label:'CLASS',value:data.cabin}],
 backFields:[{key:'date',label:'TRAVEL DATE',value:data.date},{key:'airports',label:'ROUTE',value:`${data.from.city} (${data.from.code}) → ${data.to.city} (${data.to.code})`}]}
 };
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
