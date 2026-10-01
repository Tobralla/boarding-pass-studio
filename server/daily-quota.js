import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {updateQuota} from '../shared/quota.js';
export function createDailyQuota(file=resolve('.data/free-pass-quota.json')){
 let pending=Promise.resolve();
 return function quota(action='status'){
  const operation=pending.then(async()=>{
   let saved;try{saved=JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
   const before=updateQuota(saved);
   if(action==='reserve'&&before.status.remaining===0){const error=new Error('No free passes left today. Try again after midnight UTC.');error.status=429;throw error;}
   const {value,status}=updateQuota(saved,action);
   await mkdir(dirname(file),{recursive:true});await writeFile(`${file}.tmp`,JSON.stringify(value));await rename(`${file}.tmp`,file);
   return status;
  });
  pending=operation.catch(()=>{});return operation;
 };
}
export const dailyQuota=createDailyQuota();
