import 'dotenv/config';
import express from 'express';
import {createServer} from 'node:http';
import {createServer as createViteServer} from 'vite';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApi} from './api.js';
import {corsForApi} from './cors.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const app=express();
const httpServer=createServer(app);
app.disable('x-powered-by');app.use(express.json({limit:'20kb'}));
app.use('/api',corsForApi(),createApi());
if(process.env.NODE_ENV==='production'){
 app.use(express.static(resolve(root,'dist')));
 app.get('/{*path}',(_,res)=>res.sendFile(resolve(root,'dist/index.html')));
}else{
 const vite=await createViteServer({root,server:{middlewareMode:true,hmr:{server:httpServer}},appType:'spa'});app.use(vite.middlewares);
}
const port=Number(process.env.PORT)||5173;
httpServer.on('error',error=>{
 console.error(`Could not start PassPort on port ${port}: ${error.message}`);
 process.exit(1);
});
const host=process.env.HOST||(process.env.NODE_ENV==='production'?'0.0.0.0':'127.0.0.1');
httpServer.listen(port,host,()=>console.log(`PassPort Studio ready at http://${host}:${port}`));
