import JSZip from 'jszip';
import * as asn1js from 'asn1js';
import {ContentInfo,SignedData,Certificate} from 'pkijs';
const bytesFrom64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
export async function verifyRemotePass(bytes,args,rootsPem){
 const zip=await JSZip.loadAsync(bytes,{checkCRC32:true});
 for(const file of ['manifest.json','pass.json','signature','icon.png','logo.png'])if(!zip.file(file))throw new Error(`Missing ${file}`);
 const manifestBytes=await zip.file('manifest.json').async('uint8array'),manifest=JSON.parse(new TextDecoder().decode(manifestBytes));
 const files=Object.keys(zip.files).filter(name=>!zip.files[name].dir&&!['signature','manifest.json'].includes(name)).sort();
 if(JSON.stringify(files)!==JSON.stringify(Object.keys(manifest).sort()))throw new Error('Incomplete manifest');
 for(const [name,hash] of Object.entries(manifest))if(await digest(await zip.file(name).async('uint8array'))!==hash.toLowerCase())throw new Error('Manifest hash mismatch');
 const signature=await zip.file('signature').async('arraybuffer');
 const content=new ContentInfo({schema:asn1js.fromBER(signature).result});
 const signed=new SignedData({schema:content.content});
 const roots=(rootsPem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)||[]).map(pem=>new Certificate({schema:asn1js.fromBER(bytesFrom64(pem.replace(/-----[^-]+-----|\s/g,'')).buffer).result}));
 const result=await signed.verify({signer:0,data:manifestBytes.buffer.slice(manifestBytes.byteOffset,manifestBytes.byteOffset+manifestBytes.byteLength),trustedCerts:roots,checkChain:true,extendedMode:true});
 if(!result.signatureVerified||!result.signerCertificateVerified)throw new Error('Signature or Apple trust chain verification failed');
 const pass=JSON.parse(await zip.file('pass.json').async('string'));
 const equal=(actual,expected)=>{if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('Pass details changed');};
 equal(pass.formatVersion,1);equal(pass.serialNumber,args.serial_number);equal(pass.organizationName,args.organization_name);equal(pass.description,args.description);equal(pass.boardingPass?.transitType,'PKTransitTypeAir');
 const cert=result.signerCertificate;
 const subject=oid=>cert.subject.typesAndValues.find(v=>v.type===oid)?.value.valueBlock.value;
 equal(pass.passTypeIdentifier,subject('0.9.2342.19200300.100.1.1'));equal(pass.teamIdentifier,subject('2.5.4.11'));
 const now=new Date();if(cert.notBefore.value>now||cert.notAfter.value<now)throw new Error('Signing certificate is not currently valid');
 for(const [key,value] of Object.entries({headerFields:args.header_fields,primaryFields:args.primary_fields,secondaryFields:args.secondary_fields,auxiliaryFields:args.auxiliary_fields,backFields:args.back_fields})){
  // JSON object member order is immaterial; compare the field values explicitly.
  const actual=pass.boardingPass[key]||[];if(actual?.length!==value.length)throw new Error('Boarding fields changed');
  value.forEach((f,i)=>{equal(actual[i].key,f.key);equal(actual[i].label,f.label);equal(actual[i].value,f.value);});
 }
 for(const [key,hex] of Object.entries({backgroundColor:args.background_color,foregroundColor:args.foreground_color,labelColor:args.label_color}))equal(pass[key]?.replace(/\s/g,''),`rgb(${hex.slice(1).match(/../g).map(x=>parseInt(x,16)).join(',')})`);
 const barcode=pass.barcodes?.[0]||pass.barcode;equal(barcode?.message,args.barcode_message);equal(barcode?.format,'PKBarcodeFormatQR');if(barcode.altText)throw new Error('Unexpected barcode caption');
 const logo=await zip.file('logo.png').async('base64');equal(logo,args.logo_png_b64);
 return pass;
}
