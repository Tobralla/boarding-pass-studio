import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import JSZip from 'jszip';
import {createQuickBatch,normalizeBatchName} from '../shared/quick-batch.js';
import {validatePass,passJSON,templates} from '../shared/pass-data.js';
import {collectBatch,packBatch} from '../src/batch-download.js';
const airports=JSON.parse(await readFile(new URL('../public/airports.json',import.meta.url),'utf8'));
function random(){let seed=42;return ()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);}
const options={name:' example / alex ',template:'emirates',color:'#b82331',airports,now:new Date('2026-10-01T12:00:00Z')};
test('quick generation creates 1–5 distinct routes and times in First class with LASTNAME/FIRSTNAME',()=>{
 for(let count=1;count<=5;count++){
  const passes=createQuickBatch({...options,count,random:random()});assert.equal(passes.length,count);
  assert.equal(new Set(passes.flatMap(p=>[p.from.code,p.to.code])).size,count*2);
  assert.equal(new Set(passes.map(p=>p.boardingTime)).size,count);
  for(const p of passes){validatePass(p);assert.equal(p.name,'EXAMPLE/ALEX');assert.equal(p.cabin,'First');assert.equal(p.group,'1');assert.match(p.seat,/^[1-4][ADF]$/);assert.equal(p.color,'#b82331');assert.ok(p.flight.startsWith('EK '));assert.equal(p.barcode,'');assert.equal(passJSON(p).boardingPass.auxiliaryFields[1].value,'First');assert.ok(p.date>='2026-10-01'&&p.date<='2026-10-21');}
 }
 for(const template of Object.keys(templates))assert.ok(createQuickBatch({...options,count:1,template,random:random()})[0].flight.startsWith(templates[template].prefix));
 assert.equal(normalizeBatchName('de la cruz / josé'),'DE LA CRUZ/JOSÉ');
});
test('quick generation rejects invalid names, counts, and an incomplete airport directory',()=>{
 for(const name of ['Alex Example','/ALEX','EXAMPLE/','A/B/C',' '.repeat(4)+'/A'])assert.throws(()=>createQuickBatch({...options,name,count:1}),/LASTNAME\/FIRSTNAME/);
 for(const count of [0,6,1.5,'3'])assert.throws(()=>createQuickBatch({...options,count}),/between 1 and 5/);
 assert.throws(()=>createQuickBatch({...options,count:5,airports:airports.slice(0,2)}),/directory/);
});
test('mixed quick batches choose airlines independently and preserve matching flight prefixes and default colors',()=>{
 for(let count=1;count<=5;count++){
  const passes=createQuickBatch({...options,color:undefined,count,mixedTemplates:true,random:random()});
  assert.equal(passes.length,count);
  for(const p of passes){
   assert.ok(p.flight.startsWith(templates[p.template].prefix+' '));
   assert.equal(p.color,undefined);
   assert.equal(p.cabin,'First');
   assert.equal(passJSON(p).description,`${templates[p.template].name} boarding pass`);
  }
 }
 const repeats=createQuickBatch({...options,color:undefined,count:5,mixedTemplates:true,random:()=>0.1});
 assert.equal(new Set(repeats.map(p=>p.template)).size,1,'Repeated airlines must be allowed');
 assert.equal(repeats[0].template,'united');
});
test('batch requests run sequentially, preserve partial successes, and retry only unfinished passes',async()=>{
 const passes=createQuickBatch({...options,count:3,random:random()});let calls=0,active=0;
 const first=await collectBatch(passes,{download:async()=>{assert.equal(active++,0);try{calls++;if(calls===2)throw new Error('Service unavailable');return new Blob(['signed-one']);}finally{active--;}}});
 assert.equal(calls,2);assert.equal(first.files.length,1);assert.equal(first.error.message,'Service unavailable');
 const attempted=[];
 const retried=await collectBatch(passes,{completed:first.files,download:async pass=>{attempted.push(pass);return new Blob(['signed-next']);}});
 assert.deepEqual(attempted,passes.slice(1));assert.equal(retried.files.length,3);assert.equal(retried.error,null);
 assert.deepEqual(retried.files[0].bytes,first.files[0].bytes);
 const again=await collectBatch(passes,{completed:retried.files,download:async()=>assert.fail('Already signed passes must be reused')});assert.equal(again.files.length,3);
});
test('one pass downloads as pkpass; multiple passes use the Apple pkpasses archive layout',async()=>{
 const passes=createQuickBatch({...options,count:2,random:random()});
 const {files}=await collectBatch(passes,{download:async p=>new Blob([JSON.stringify(passJSON(p))])});
 const single=await packBatch(files.slice(0,1));assert.equal(single.extension,'pkpass');assert.equal(single.blob.type,'application/vnd.apple.pkpass');assert.deepEqual(new Uint8Array(await single.blob.arrayBuffer()),files[0].bytes);
 const bundle=await packBatch(files);assert.equal(bundle.extension,'pkpasses');assert.equal(bundle.blob.type,'application/vnd.apple.pkpasses');
 const zip=await JSZip.loadAsync(await bundle.blob.arrayBuffer());assert.deepEqual(Object.keys(zip.files),files.map(f=>f.name));
 for(const file of files)assert.deepEqual(await zip.file(file.name).async('uint8array'),file.bytes);
 await assert.rejects(()=>packBatch([]),/No boarding passes/);
});
