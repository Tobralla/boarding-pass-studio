export class FreeSigningError extends Error{
 constructor(message,status=502){super(message);this.name='FreeSigningError';this.status=status;}
}
async function readRpc(response,id){
 if(response.headers.get('content-type')?.includes('application/json'))return response.json();
 if(!response.body)throw new FreeSigningError('The signing service returned an empty response.');
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffered='';
 try{
  while(true){
   const {value,done}=await reader.read();buffered+=decoder.decode(value||new Uint8Array(),{stream:!done});buffered=buffered.replace(/\r\n/g,'\n');let end;
   while((end=buffered.indexOf('\n\n'))!==-1){
    const event=buffered.slice(0,end);buffered=buffered.slice(end+2);
    const raw=event.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
    if(raw){const message=JSON.parse(raw);if(message.id===id)return message;}
   }
   if(done)throw new FreeSigningError('The signing service closed the connection before returning a pass.');
  }
 }finally{await reader.cancel().catch(()=>{});}
}
export async function requestSignedPass(args,{fetchImpl=fetch}={}){
 const endpoint='https://walletmcppass.com/mcp';let session='',version='2025-03-26',nextId=1;
 async function rpc(method,params,notification=false){
  const id=notification?undefined:nextId++;
  const response=await fetchImpl(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream',...(session?{'Mcp-Session-Id':session,'MCP-Protocol-Version':version}:{})},body:JSON.stringify({jsonrpc:'2.0',...(id?{id}:{}),method,...(params?{params}:{})}),signal:AbortSignal.timeout(45000)});
  if(!response.ok){await response.body?.cancel();throw new FreeSigningError(response.status===429?'The free signing limit has been reached. Try again later.':`The signing service is unavailable (HTTP ${response.status}). Try again later.`,response.status===429?429:502);}
  session=response.headers.get('mcp-session-id')||session;
  if(notification){await response.body?.cancel();return;}
  const message=await readRpc(response,id);
  if(message.id!==id)throw new FreeSigningError('The signing service returned an unexpected response.');
  if(message.error)throw new FreeSigningError(message.error.message||'The signing service rejected the request.');
  return message.result;
 }
 try{
  const initialized=await rpc('initialize',{protocolVersion:version,capabilities:{},clientInfo:{name:'passport-studio',version:'1.0.0'}});
  version=initialized.protocolVersion||version;
  await rpc('notifications/initialized',undefined,true);
  const result=await rpc('tools/call',{name:'create_wallet_pass',arguments:args});
  if(result.isError){const reason=result.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n')||'The signing service could not create the pass.';throw new FreeSigningError(/rate.?limit|quota|daily limit|too many|per day/i.test(reason)?'The free signing limit has been reached. Try again later.':reason,/rate.?limit|quota|daily limit|too many|per day/i.test(reason)?429:502);}
  let output=result.structuredContent;
  if(!output?.download_url)for(const block of result.content||[])if(block.type==='text'){try{const candidate=JSON.parse(block.text);if(candidate.download_url){output=candidate;break;}}catch{}}
  if(!output?.download_url)throw new FreeSigningError('The signing service returned no downloadable pass.');
  const url=new URL(output.download_url);
  if(url.protocol!=='https:'||!['walletmcppass.com','vps.arshwaraich.com'].includes(url.hostname)||url.username||url.password||url.port||!/^\/(?:wallet-mcp\/)?download\/[A-Za-z0-9_-]+$/.test(url.pathname))throw new FreeSigningError('The signing service returned an unexpected download URL.');
  const download=await fetchImpl(url,{signal:AbortSignal.timeout(30000),redirect:'error'});
  if(!download.ok){await download.body?.cancel();throw new FreeSigningError('The signed pass could not be downloaded. Try again.');}
  const bytes=Buffer.from(await download.arrayBuffer());
  if(!bytes.length||bytes.length>5*1024*1024)throw new FreeSigningError('The signing service returned an invalid pass file.');
  return bytes;
 }catch(error){
  if(error instanceof FreeSigningError)throw error;
  if(error.name==='TimeoutError'||error.name==='AbortError')throw new FreeSigningError('The signing service took too long to respond. Try again.',504);
  throw new FreeSigningError('Could not connect to the free signing service. Check your connection and try again.');
 }finally{
  if(session)fetchImpl(endpoint,{method:'DELETE',headers:{'Mcp-Session-Id':session,'MCP-Protocol-Version':version},signal:AbortSignal.timeout(3000)}).catch(()=>{});
 }
}
