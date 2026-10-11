// A bearer-authenticated tunnel entry point; never expose raw local services.
import http from 'node:http';
import {timingSafeEqual} from 'node:crypto';
const token=process.env.DATA_API_TOKEN;
if(!token)throw new Error('DATA_API_TOKEN required');
const allowed=Buffer.from('Bearer '+token);
http.createServer((req,res)=>{
 const auth=Buffer.from(req.headers.authorization||'');
 if(auth.length!==allowed.length||!timingSafeEqual(auth,allowed)){res.writeHead(401);res.end('Unauthorized');return;}
 const camera=req.url.startsWith('/camera/'), data=req.url.startsWith('/data/');
 if(!camera&&!data){res.writeHead(404);res.end();return;}
 const path=req.url.slice(camera?7:5);
 // Monitor's cookie-only local access is intentionally never exposed.
 if(data&&path.startsWith('/monitor')){res.writeHead(404);res.end();return;}
 const upstream=http.request({hostname:'127.0.0.1',port:camera?3201:3200,path,method:req.method,headers:{...req.headers,host:'127.0.0.1',authorization:'Bearer '+token}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
 upstream.on('error',()=>{if(!res.headersSent)res.writeHead(503);res.end('Fridge device offline');});req.pipe(upstream);
 req.on('aborted',()=>upstream.destroy());
 res.on('close',()=>upstream.destroy());
}).listen(3210,'127.0.0.1',()=>console.log('Authenticated hardware gateway ready on localhost:3210'));
