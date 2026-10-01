import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createBundle,templates} from '../server/pass.js';
import JSZip from 'jszip';
import {build} from 'rolldown';
const pass={name:'Alex Example',cabin:'First',from:{code:'CPH',city:'Copenhagen'},to:{code:'LHR',city:'London'},date:'2026-10-15',boardingTime:'19:25',flight:'TEST 100',seat:'1A',gate:'B1',group:'1'};
const assets={};
for(const template of Object.keys(templates)){
 assets[template]={};
 for(const ink of ['light','dark']){
  const zip=await JSZip.loadAsync(await createBundle({...pass,template,...(ink==='dark'?{color:'#f5f5f5'}:{})}));
  assets[template][ink]={};
  for(const name of ['logo.png','logo@2x.png','logo@3x.png','icon.png','icon@2x.png','icon@3x.png'])assets[template][ink][name]=await zip.file(name).async('base64');
 }
}
await mkdir('.worker-build',{recursive:true});
await writeFile('.worker-build/assets.json',JSON.stringify(assets));
await writeFile('.worker-build/roots.json',JSON.stringify(await readFile('server/apple-roots.crt','utf8')));
await build({input:'worker/index.js',platform:'browser',external:['node:buffer'],output:{file:'.worker-build/worker.js',format:'esm',minify:true}});
console.log('Built signing worker with airline images and Apple trust roots.');
