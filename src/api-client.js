export function createApiClient({base='',staticHosting=false,fetchImpl=fetch}={}){
 const root=base.replace(/\/$/,'');
 async function request(path,options){
  if(staticHosting&&!root)throw new Error('Pass downloads are not available on this hosted site yet.');
  const response=await fetchImpl(`${root}/api/${path}`,options);
  if(!response.ok){
   let message='The signing server is unavailable. Try again later.';
   try{const data=await response.json();message=data.error||message;}catch{}
   throw new Error(message);
  }
  return response;
 }
 return {
  configured:!staticHosting||!!root,
  async status(){return (await request('status')).json();},
  async download(pass,format){return (await request('export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pass,format})})).blob();},
 };
}
