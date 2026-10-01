import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApiClient} from '../src/api-client.js';
import {corsForApi} from './cors.js';
test('Pages export uses configured backend and preserves the export body',async()=>{
 const calls=[];const client=createApiClient({staticHosting:true,base:'https://signing.example.com/',fetchImpl:async(url,options)=>{calls.push({url,options});return options?new Response('signed-pass'):Response.json({provider:'free'});}});
 assert.deepEqual(await client.status(),{provider:'free'});
 assert.equal(await (await client.download({name:'Alex'},'pkpass')).text(),'signed-pass');
 assert.deepEqual(calls.map(c=>c.url),['https://signing.example.com/api/status','https://signing.example.com/api/export']);
 assert.deepEqual(JSON.parse(calls[1].options.body),{pass:{name:'Alex'},format:'pkpass'});
});
test('Pages without a backend explains missing configuration without contacting a nonexistent API',async()=>{
 const client=createApiClient({staticHosting:true,fetchImpl:async()=>assert.fail('Pages has no API')});assert.equal(client.configured,false);
 await assert.rejects(()=>client.download({},'pkpass'),/not available on this hosted site/);
 const local=createApiClient({fetchImpl:async url=>{assert.equal(url,'/api/status');return Response.json({provider:'free'});}});assert.equal(local.configured,true);await local.status();
});
test('export errors retain the service message and handle non-JSON errors',async()=>{
 for(const [body,message] of [[JSON.stringify({error:'Daily limit reached'}),'Daily limit reached'],['<html>Bad gateway</html>','signing server is unavailable']]){
  const client=createApiClient({fetchImpl:async()=>new Response(body,{status:502})});await assert.rejects(()=>client.download({},'pkpass'),new RegExp(message));
 }
});
function runCors(origin,method='POST'){
 const req={protocol:'http',method,get:key=>({'Origin':origin,'Host':'127.0.0.1:5173'}[key])};
 const res={headers:{},code:200,varied:false,next:false,vary(){this.varied=true;},set(key,value){Object.assign(this.headers,typeof key==='object'?key:{[key]:value});return this;},status(code){this.code=code;return this;},json(body){this.body=body;return this;},end(){return this;}};
 corsForApi('https://tobralla.github.io')(req,res,()=>{res.next=true;});return res;
}
test('signing API permits Pages preflight and same-origin requests while rejecting other browser origins',()=>{
 const preflight=runCors('https://tobralla.github.io','OPTIONS');assert.equal(preflight.code,204);assert.equal(preflight.headers['Access-Control-Allow-Origin'],'https://tobralla.github.io');assert.equal(preflight.headers['Access-Control-Allow-Headers'],'Content-Type');
 assert.equal(runCors('http://127.0.0.1:5173').next,true);assert.equal(runCors(undefined).next,true);
 const denied=runCors('https://unrelated.example.com');assert.equal(denied.code,403);assert.equal(denied.next,false);assert.equal(denied.headers['Access-Control-Allow-Origin'],undefined);
});
