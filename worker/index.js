import {Buffer} from 'node:buffer';
import JSZip from 'jszip';
import assets from '../.worker-build/assets.json';
import roots from '../.worker-build/roots.json';
import {passTheme} from '../shared/theme.js';
import {passJSON,templates,validatePass} from '../shared/pass-data.js';
import {providerArguments} from '../shared/provider-args.js';
import {updateQuota} from '../shared/quota.js';
import {requestSignedPass,FreeSigningError} from '../server/wallet-service.js';
import {verifyRemotePass} from './verify.js';
export class DailyQuota{
 constructor(state){this.state=state;}
 async fetch(request){
  const action=new URL(request.url).pathname.slice(1)||'status';
  return this.state.storage.transaction(async tx=>{
   const saved=await tx.get('quota');const before=updateQuota(saved);
   if(action==='reserve'&&before.status.remaining===0)return Response.json(before.status,{status:429});
   const {value,status}=updateQuota(saved,action);await tx.put('quota',value);return Response.json(status);
  });
 }
}
async function quota(env,action='status'){
 const object=env.DAILY_QUOTA.get(env.DAILY_QUOTA.idFromName('shared-site-allowance'));
 const response=await object.fetch(`https://quota/${action}`);
 return {ok:response.ok,status:await response.json()};
}
export default{
 async fetch(request,env,ctx){
  const origin=request.headers.get('Origin'),allowed=(env.ALLOWED_ORIGINS||'').split(',');
  const headers={'Cache-Control':'no-store','Vary':'Origin','Access-Control-Expose-Headers':'X-Free-Passes-Remaining,X-Free-Passes-Reset','X-Content-Type-Options':'nosniff'};
  if(origin){if(!allowed.includes(origin))return Response.json({error:'This website cannot use the signing server.'},{status:403});headers['Access-Control-Allow-Origin']=origin;}
  const json=(body,status=200)=>Response.json(body,{status,headers});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'}});
  const path=new URL(request.url).pathname;
  if(path==='/api/status'&&request.method==='GET')return json({signingReady:true,provider:'free',freeDailyLimit:30,quota:(await quota(env)).status});
  if(path!=='/api/export'||request.method!=='POST')return json({error:'Not found'},404);
  let reserved=false;
  try{
   const body=await request.text();if(new TextEncoder().encode(body).length>20000)return json({error:'Pass details are too large.'},413);
   let data;try{data=JSON.parse(body);}catch{return json({error:'Enter valid pass details.'},400);}
   const {pass,format}=data;
   try{if(!['pkpass','zip'].includes(format))throw new Error('Choose a valid export format.');validatePass(pass);}catch(error){return json({error:error.message},400);}
   const theme=passTheme(templates[pass.template],pass.color),images=assets[pass.template][theme.darkInk?'dark':'light'];
   let bytes;
   if(format==='zip'){
    const zip=new JSZip();zip.file('pass.json',JSON.stringify(passJSON(pass),null,2));
    for(const [name,base64] of Object.entries(images))zip.file(name,base64,{base64:true});
    zip.file('README.txt','Unsigned template bundle. Sign with an Apple-issued Pass Type ID certificate before adding to Wallet.');
    const manifest={};for(const [name,file] of Object.entries(zip.files)){const hash=await crypto.subtle.digest('SHA-1',await file.async('uint8array'));manifest[name]=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');}
    zip.file('manifest.json',JSON.stringify(manifest));bytes=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
   }else{
    const args=providerArguments(pass,images);
    const reservation=await quota(env,'reserve');if(!reservation.ok)return json({error:'No free passes left today. Try again after midnight UTC.',quota:reservation.status},429);
    reserved=true;
    bytes=await requestSignedPass(args);
    try{await verifyRemotePass(bytes,args,roots);}catch(error){console.error('Signed pass verification failed:',error.message);throw new FreeSigningError('The signed pass failed verification. Try again later.');}
   }
   const current=(await quota(env)).status;
   return new Response(bytes,{headers:{...headers,'Content-Type':format==='pkpass'?'application/vnd.apple.pkpass':'application/zip','Content-Disposition':`attachment; filename="${pass.from.code}-${pass.to.code}-boarding-pass.${format}"`,'X-Free-Passes-Remaining':String(current.remaining),'X-Free-Passes-Reset':current.resetsAt}});
  }catch(error){
   if(reserved)await quota(env,error.status===429?'block':'release');
   const status=[400,429,502,504].includes(error.status)?error.status:500;
   console.error('Pass export failed:',error.message);
   return json({error:status===500?'Pass generation failed. Try again later.':error.message,quota:(await quota(env)).status},status);
  }
 }
};
