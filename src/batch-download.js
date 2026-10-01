import JSZip from 'jszip';
export async function collectBatch(passes,{download,completed=[],onProgress=()=>{},onFile=()=>{}}){
 const files=[...completed];let error=null;
 onProgress(files.length,passes.length);
 for(let index=0;index<passes.length;index++){
  if(files.some(file=>file.index===index))continue;
  try{
   const pass=passes[index],blob=await download(pass,'pkpass');
   const file={index,name:`${String(index+1).padStart(2,'0')}-${pass.from.code}-${pass.to.code}.pkpass`,bytes:new Uint8Array(await blob.arrayBuffer())};
   files.push(file);onFile([...files]);onProgress(files.length,passes.length);
  }catch(cause){error=cause;break;}
 }
 return {files:files.sort((a,b)=>a.index-b.index),error};
}
export async function packBatch(files){
 if(!files.length)throw new Error('No boarding passes have been generated yet.');
 if(files.length===1)return {blob:new Blob([files[0].bytes],{type:'application/vnd.apple.pkpass'}),extension:'pkpass'};
 const zip=new JSZip();for(const file of files)zip.file(file.name,file.bytes);
 return {blob:new Blob([await zip.generateAsync({type:'uint8array',compression:'STORE'})],{type:'application/vnd.apple.pkpasses'}),extension:'pkpasses'};
}
