import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import JSZip from 'jszip';
import {createQuickBatch} from '../shared/quick-batch.js';
import {collectBatch,packBatch} from '../src/batch-download.js';
import {createApiClient} from '../src/api-client.js';
import {verifyPkpass} from './verify-pkpass.mjs';
import {appleRoots} from '../server/free-pass.js';

// Requests two real signed passes and consumes two daily generations.
const backend=process.argv[2]||'https://passport-signing.tobralla.workers.dev';
const api=createApiClient({base:backend});
const before=await api.status();
const airports=JSON.parse(await readFile('public/airports.json','utf8'));
const passes=createQuickBatch({name:'EXAMPLE/ALEX',count:2,template:'klm',airports});
const result=await collectBatch(passes,{download:api.download});
if(result.error)throw result.error;
const packed=await packBatch(result.files);
assert.equal(packed.extension,'pkpasses');
assert.equal(packed.blob.type,'application/vnd.apple.pkpasses');
const folder='verification/batch';
await mkdir(folder,{recursive:true});
const bytes=Buffer.from(await packed.blob.arrayBuffer());
await writeFile(`${folder}/boarding-passes.pkpasses`,bytes);
const archive=await JSZip.loadAsync(bytes,{checkCRC32:true});
assert.equal(Object.keys(archive.files).length,2);
const checks=[];
for(const [index,file] of result.files.entries()){
 const signed=await archive.file(file.name).async('nodebuffer');
 assert.deepEqual(signed,Buffer.from(file.bytes));
 const verified=await verifyPkpass(signed,{folder:`${folder}/checks-${index}`,trustedRootsPem:await appleRoots(),expected:{description:'KLM boarding pass'}});
 const fields=verified.pass.boardingPass;
 assert.equal(fields.auxiliaryFields.find(f=>f.key==='passenger').value,'EXAMPLE/ALEX');
 assert.equal(fields.auxiliaryFields.find(f=>f.key==='class').value,'First');
 assert.equal(fields.primaryFields.find(f=>f.key==='origin').value,passes[index].from.code);
 assert.equal(fields.primaryFields.find(f=>f.key==='destination').value,passes[index].to.code);
 checks.push({route:`${passes[index].from.code}-${passes[index].to.code}`,boardingTime:passes[index].boardingTime,...verified.checks});
}
const after=await api.status();
assert.equal(after.quota.remaining,before.quota.remaining-2);
const report={backend,checks,remainingBefore:before.quota.remaining,remainingAfter:after.quota.remaining,iphoneInstallation:'not-tested'};
await writeFile(`${folder}/report.json`,JSON.stringify(report,null,2));
console.log(report);
