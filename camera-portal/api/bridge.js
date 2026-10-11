import {createHmac,timingSafeEqual} from 'node:crypto';
function equal(a,b){const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y);}
function signature(expiry){return createHmac('sha256',process.env.FRIDGE_DEVICE_KEY).update(expiry).digest('hex');}
let attempts=0,windowStart=Date.now();
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const path=Array.isArray(req.query.path)?req.query.path.join('/'):String(req.query.path||'');
 if(req.method==='POST' && new URL(req.headers.origin||'http://invalid').host!==req.headers.host){res.status(403).json({error:'Same-site request required'});return;}
 if(path==='connect'&&req.method==='POST'){
  if(Date.now()-windowStart>60000){attempts=0;windowStart=Date.now();}
  if(++attempts>10){res.status(429).json({error:'Please wait a minute'});return;}
  if(!process.env.FRIDGE_DEVICE_KEY||!process.env.FRIDGE_DEVICE_PAIR_CODE||!equal(req.body?.code,process.env.FRIDGE_DEVICE_PAIR_CODE)){res.status(401).json({error:'Incorrect device code'});return;}
  const expiry=String(Date.now()+8*3600000);
  res.setHeader('Set-Cookie',`nourish-camera=${expiry}.${signature(expiry)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`);
  res.status(200).json({ok:true});return;
 }
 const ticket=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('nourish-camera='))?.slice(15);
 const [expiry,sig]=String(ticket||'').split('.');
 if(!process.env.FRIDGE_DEVICE_KEY||!/^\d+$/.test(expiry||'')||Number(expiry)<=Date.now()||!equal(sig,signature(expiry))){res.status(401).json({error:'Connect this fridge device first'});return;}
 const get=['state','frame/front','frame/shelf','stream/front','stream/shelf'],post=['begin','finish','say','audit'];
 if(!(req.method==='GET'?get: req.method==='POST'?post:[]).includes(path)){res.status(404).json({error:'Not found'});return;}
 const streaming=path.startsWith('stream/');
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),streaming?25000:12000);
 res.on('close',()=>controller.abort());
 try{
  const upstream=await fetch(process.env.FRIDGE_CAMERA_BASE_URL+'/'+path,{method:req.method,headers:{Authorization:'Bearer '+process.env.FRIDGE_DATA_TOKEN,'Content-Type':'application/json'},...(req.method==='POST'?{body:JSON.stringify(path==='begin'?{}:req.body||{})}:{}),signal:controller.signal});
  res.status(upstream.status);res.setHeader('Content-Type',upstream.headers.get('content-type')||'application/json');if(!streaming||!upstream.ok){res.end(Buffer.from(await upstream.arrayBuffer()));return;}
  res.setHeader('X-Accel-Buffering','no');
  res.flushHeaders();
  const reader=upstream.body.getReader();let bytes=0;
  try{
   while(!controller.signal.aborted){
    const {done,value}=await reader.read();if(done)break;
    bytes+=value.byteLength;
    // Reconnect before function duration and response-size limits.
    if(bytes>3500000)break;
    if(!res.write(Buffer.from(value))){await new Promise(resolve=>{
     const finish=()=>{res.off('drain',finish);res.off('close',finish);resolve();};
     res.once('drain',finish);res.once('close',finish);
    });}
   }
  }finally{await reader.cancel().catch(()=>{});res.end();}
 }catch{if(!res.headersSent)res.status(503).json({error:'Fridge Mac is offline. Keep its camera process and secure tunnel running.'});else res.end();}
 finally{clearTimeout(timer);controller.abort();}
}
