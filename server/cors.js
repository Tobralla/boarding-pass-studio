export function corsForApi(allowedOrigins=process.env.ALLOWED_ORIGINS||''){
 const allowed=new Set(allowedOrigins.split(',').map(value=>value.trim()).filter(Boolean));
 return function apiCors(req,res,next){
  const origin=req.get('Origin');
  if(origin){
   res.vary('Origin');
   const sameOrigin=`${req.protocol}://${req.get('Host')}`;
   if(origin!==sameOrigin&&!allowed.has(origin))return res.status(403).json({error:'This website is not allowed to use the signing server.'});
   res.set('Access-Control-Allow-Origin',origin);
  }
  if(req.method==='OPTIONS'){
   res.set({'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'});
   return res.status(204).end();
  }
  next();
 };
}
