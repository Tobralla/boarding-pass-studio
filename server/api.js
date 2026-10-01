import express from 'express';
import {createBundle,signingConfig,validatePass} from './pass.js';
import {createFreePass} from './free-pass.js';
export function createExportHandler({freeGenerator=createFreePass,bundleGenerator=createBundle,localSigning=()=>signingConfig().ready}={}){
 return async function exportPass(req,res){
  const {pass,format}=req.body||{};
  if(!['pkpass','zip'].includes(format))return res.status(400).json({error:'Choose a valid export format.'});
  try{validatePass(pass);}catch(error){return res.status(400).json({error:error.message});}
  try{
   const signed=format==='pkpass';
   const buffer=signed&&!localSigning()?await freeGenerator(pass):await bundleGenerator(pass,signed);
   const filename=`${pass.from.code}-${pass.to.code}-boarding-pass.${format}`;
   return res.set({'Content-Type':signed?'application/vnd.apple.pkpass':'application/zip','Content-Disposition':`attachment; filename="${filename}"`,'Cache-Control':'no-store'}).send(buffer);
  }catch(error){
   console.error('Pass export failed:',error.message);
   const status=[400,429,502,504].includes(error.status)?error.status:500;
   if(status===429)res.set('Retry-After','3600');
   return res.status(status).json({error:status===500?'Pass generation failed. Check the server configuration and try again.':error.message});
  }
 };
}
export function createApi(){
 const router=express.Router();
 router.get('/status',(_,res)=>res.json({signingReady:true,provider:signingConfig().ready?'local':'free',freeDailyLimit:30}));
 router.post('/export',createExportHandler());
 return router;
}
