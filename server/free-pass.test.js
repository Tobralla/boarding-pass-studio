import {test} from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import forge from 'node-forge';
import {createHash} from 'node:crypto';
import {freePassArguments,createFreePass,appleRoots} from './free-pass.js';
import {requestSignedPass,FreeSigningError} from './wallet-service.js';
import {createExportHandler} from './api.js';
import {templates,createBundle} from './pass.js';
const pass={template:'united',name:'Alex Example',cabin:'First',from:{code:'CPH',city:'Copenhagen'},to:{code:'LHR',city:'London'},date:'2026-10-15',boardingTime:'19:25',flight:'UA 1846',seat:'1A',gate:'B82',group:'2',barcode:''};
function transport({sse=false,url='https://walletmcppass.com/download/test-token',failure}={}){
 const calls=[];
 const fetchImpl=async(input,options)=>{
  calls.push({input:String(input),options});
  if(options.method==='DELETE')return new Response(null,{status:204});
  if(!options.method)return new Response(Buffer.from('PK-test'));
  const body=JSON.parse(options.body);
  if(body.method==='notifications/initialized')return new Response(null,{status:202});
  const result=body.method==='initialize'?{protocolVersion:'2025-03-26'}:failure||{content:[{type:'text',text:JSON.stringify({download_url:url})}]};
  const message=JSON.stringify({jsonrpc:'2.0',id:body.id,result});
  return new Response(sse?`event: message\r\ndata: ${message}\r\n\r\n`:message,{headers:{'Content-Type':sse?'text/event-stream':'application/json','Mcp-Session-Id':'test-session'}});
 };
 return {fetchImpl,calls};
}
test('MCP transport handles JSON and SSE, carries session headers, and downloads the returned pass',async()=>{
 for(const sse of [false,true]){
  const mock=transport({sse});const args={style:'boardingPass',primary_fields:[{key:'origin',value:'CPH'}]};
  assert.equal((await requestSignedPass(args,mock)).toString(),'PK-test');
  const call=mock.calls.find(c=>c.options.body&&JSON.parse(c.options.body).method==='tools/call');
  assert.deepEqual(JSON.parse(call.options.body).params,{name:'create_wallet_pass',arguments:args});
  assert.equal(call.options.headers['Mcp-Session-Id'],'test-session');
  assert.equal(mock.calls.at(-1).options.method,'DELETE');
 }
});
test('MCP transport rejects unsafe downloads and reports quota failures',async()=>{
 for(const url of ['http://walletmcppass.com/download/test','https://example.com/download/test','https://walletmcppass.com/other/test']){
  const mock=transport({url});await assert.rejects(()=>requestSignedPass({},mock),/unexpected download URL/);
  assert.ok(!mock.calls.some(c=>!c.options.method));
 }
 const mock=transport({failure:{isError:true,content:[{type:'text',text:'Daily limit exceeded'}]}});
 await assert.rejects(()=>requestSignedPass({},mock),e=>e.status===429&&/limit/.test(e.message));
 await assert.rejects(()=>requestSignedPass({},{fetchImpl:async()=>new Response('',{status:429})}),e=>e.status===429);
});
test('free signing arguments preserve all five templates, custom colors, and Unicode passenger names',async()=>{
 for(const template of Object.keys(templates)){
  const args=await freePassArguments({...pass,template});assert.equal(args.background_color,templates[template].color);
  assert.equal(args.auxiliary_fields[1].value,'First');assert.equal(args.primary_fields[0].value,'CPH');
  const zip=await JSZip.loadAsync(await createBundle({...pass,template}));
  assert.equal(args.logo_png_b64,(await zip.file('logo.png').async('nodebuffer')).toString('base64'));
 }
 const args=await freePassArguments({...pass,name:'Tobias Ægir ✈',color:'#f5f5f5'});
 assert.equal(args.background_color,'#f5f5f5');assert.equal(args.foreground_color,'#171717');
 assert.match(args.barcode_message,/^[\x00-\x7f]*$/);assert.equal(JSON.parse(args.barcode_message.slice('PASSPORT-DEMO:'.length)).name,'Tobias Ægir ✈');
 await assert.rejects(()=>freePassArguments({...pass,barcode:'custom ✈'}),e=>e.status===400);
 assert.ok((await appleRoots()).includes('BEGIN CERTIFICATE'));
});
function response(){return {statusCode:200,headers:{},status(code){this.statusCode=code;return this;},set(key,value){Object.assign(this.headers,typeof key==='object'?key:{[key]:value});return this;},send(body){this.body=body;return this;},json(body){this.body=body;return this;}};}
test('export API selects free signing without certificates, keeps ZIP local, and supports own certificates',async()=>{
 const calls=[];const handler=createExportHandler({localSigning:()=>false,freeGenerator:async()=>{calls.push('free');return Buffer.from('signed');},bundleGenerator:async(_,signed)=>{calls.push(signed?'local-signed':'zip');return Buffer.from('bundle');}});
 const res=response();await handler({body:{pass,format:'pkpass'}},res);assert.equal(res.statusCode,200);assert.equal(res.body.toString(),'signed');assert.equal(res.headers['Content-Type'],'application/vnd.apple.pkpass');
 await handler({body:{pass,format:'zip'}},response());assert.deepEqual(calls,['free','zip']);
 const local=createExportHandler({localSigning:()=>true,bundleGenerator:async(_,signed)=>{assert.equal(signed,true);return Buffer.from('local');},freeGenerator:async()=>assert.fail('Must use local certificate')});
 await local({body:{pass,format:'pkpass'}},response());
 const invalid=response();await handler({body:{pass:{...pass,name:''},format:'pkpass'}},invalid);assert.equal(invalid.statusCode,400);assert.deepEqual(calls,['free','zip']);
 const quota=response();await createExportHandler({localSigning:()=>false,freeGenerator:async()=>{throw new FreeSigningError('Daily limit reached',429);}})({body:{pass,format:'pkpass'}},quota);assert.equal(quota.statusCode,429);assert.equal(quota.headers['Retry-After'],'3600');
});
test('free pass integration accepts a correctly signed fixture and rejects changed signed content',async()=>{
 // A local test issuer exercises verification; it does not represent an Apple certificate.
 const keys=forge.pki.rsa.generateKeyPair(2048),cert=forge.pki.createCertificate();cert.publicKey=keys.publicKey;cert.serialNumber='01';
 cert.validity.notBefore=new Date(Date.now()-1000);cert.validity.notAfter=new Date(Date.now()+86400000);
 const attrs=[{name:'commonName',value:'Free signer fixture'},{name:'organizationalUnitName',value:'TESTTEAM01'},{type:'0.9.2342.19200300.100.1.1',value:'pass.com.test.free'}];cert.setSubject(attrs);cert.setIssuer(attrs);cert.sign(keys.privateKey,forge.md.sha256.create());
 const trustedRootsPem=forge.pki.certificateToPem(cert);
 const request=async(args,modify=false)=>{
  const rgb=hex=>`rgb(${hex.slice(1).match(/../g).map(x=>parseInt(x,16)).join(', ')})`;
  const json={formatVersion:1,passTypeIdentifier:'pass.com.test.free',teamIdentifier:'TESTTEAM01',serialNumber:args.serial_number,organizationName:args.organization_name,description:args.description,backgroundColor:rgb(args.background_color),foregroundColor:rgb(args.foreground_color),labelColor:rgb(args.label_color),barcodes:[{format:'PKBarcodeFormatQR',message:args.barcode_message,messageEncoding:'iso-8859-1'}],boardingPass:{transitType:'PKTransitTypeAir',headerFields:args.header_fields,primaryFields:args.primary_fields,secondaryFields:args.secondary_fields,auxiliaryFields:args.auxiliary_fields,backFields:args.back_fields}};
  if(modify)json.boardingPass.secondaryFields=json.boardingPass.secondaryFields.map(f=>f.key==='seat'?{...f,value:'99Z'}:f);
  const zip=new JSZip();zip.file('pass.json',JSON.stringify(json));zip.file('logo.png',Buffer.from(args.logo_png_b64,'base64'));zip.file('icon.png',Buffer.from(args.icon_png_b64,'base64'));
  const manifest={};for(const [name,file] of Object.entries(zip.files))manifest[name]=createHash('sha1').update(await file.async('nodebuffer')).digest('hex');
  const text=JSON.stringify(manifest);zip.file('manifest.json',text);
  const p7=forge.pkcs7.createSignedData();p7.content=forge.util.createBuffer(text,'utf8');p7.addCertificate(cert);p7.addSigner({key:keys.privateKey,certificate:cert,digestAlgorithm:forge.pki.oids.sha256,authenticatedAttributes:[{type:forge.pki.oids.contentType,value:forge.pki.oids.data},{type:forge.pki.oids.messageDigest},{type:forge.pki.oids.signingTime,value:new Date()}]});p7.sign({detached:true});zip.file('signature',Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(),'binary'));
  return zip.generateAsync({type:'nodebuffer'});
 };
 const bytes=await createFreePass({...pass,template:'emirates',color:'#f5f5f5'},{request,trustedRootsPem});assert.ok(bytes.length>0);
 await assert.rejects(()=>createFreePass(pass,{request:args=>request(args,true),trustedRootsPem}),/failed verification/);
});
