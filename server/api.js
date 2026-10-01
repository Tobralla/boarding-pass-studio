import express from 'express';
import {createBundle,signingConfig,validatePass} from './pass.js';
import {createFreePass} from './free-pass.js';
import {dailyQuota} from './daily-quota.js';
export function createExportHandler({freeGenerator=createFreePass,bundleGenerator=createBundle,localSigning=()=>signingConfig().ready,quota}={}){
 return async function exportPass(req,res){
  const {pass,format}=req.body||{};
  if(!['pkpass','zip'].includes(format))return res.status(400).json({error:'Choose a valid export format.'});
  try{validatePass(pass);}catch(error){return res.status(400).json({error:error.message});}
  let reserved=false;
  try{
   const signed=format==='pkpass',free=signed&&!localSigning();
   if(free&&quota){await quota('reserve');reserved=true;}
   const buffer=free?await freeGenerator(pass):await bundleGenerator(pass,signed);
   const filename=`${pass.from.code}-${pass.to.code}-boarding-pass.${format}`;
   return res.set({'Content-Type':signed?'application/vnd.apple.pkpass':'application/zip','Content-Disposition':`attachment; filename="${filename}"`,'Cache-Control':'no-store'}).send(buffer);
  }catch(error){
   if(reserved&&quota)await quota(error.status===429?'block':'release');
   console.error('Pass export failed:',error.message);
   const status=[400,429,502,504].includes(error.status)?error.status:500;
   if(status===429)res.set('Retry-After','3600');
   return res.status(status).json({error:status===500?'Pass generation failed. Check the server configuration and try again.':error.message});
  }
 };
}
export function createApi(){
 const router=express.Router();
 router.get('/status',async(_,res)=>{const local=signingConfig().ready;res.set('Cache-Control','no-store').json({signingReady:true,provider:local?'local':'free',freeDailyLimit:30,quota:local?null:await dailyQuota()});});
 router.post('/export',createExportHandler({quota:dailyQuota}));
 return router;
}
