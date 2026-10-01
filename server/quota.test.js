import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {updateQuota} from '../shared/quota.js';
import {createDailyQuota} from './daily-quota.js';
test('daily allowance resets at midnight UTC and distinguishes provider blocks',()=>{
 const now=new Date('2026-10-01T23:59:59Z');
 let result=updateQuota(undefined,'status',now);assert.equal(result.status.remaining,30);assert.equal(result.status.resetsAt,'2026-10-02T00:00:00.000Z');
 result=updateQuota(result.value,'reserve',now);assert.equal(result.status.remaining,29);
 const blocked=updateQuota(result.value,'block',now);assert.equal(blocked.status.remaining,0);
 const tomorrow=updateQuota(blocked.value,'status',new Date('2026-10-02T00:00:00Z'));assert.equal(tomorrow.status.remaining,30);
 assert.equal(updateQuota(result.value,'release',now).status.remaining,30);
});
test('persistent local quota reserves atomically, survives recreation, and stops at zero',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'passport-quota-test-'));const file=join(dir,'quota.json');
 try{
  const quota=createDailyQuota(file);await Promise.all(Array.from({length:30},()=>quota('reserve')));
  assert.equal((await quota()).remaining,0);await assert.rejects(()=>quota('reserve'),e=>e.status===429);
  const reloaded=createDailyQuota(file);assert.equal((await reloaded()).remaining,0);
  await reloaded('release');assert.equal((await reloaded()).remaining,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
