// A bearer-authenticated tunnel entry point; never expose raw local services.
import http from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {WebSocketServer,WebSocket} from 'ws';
import {validPreview} from './preview-auth.mjs';
const token=process.env.DATA_API_TOKEN;
if(!token)throw new Error('DATA_API_TOKEN required');
const allowed=Buffer.from('Bearer '+token);
const server=http.createServer((req,res)=>{
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
 });
const wss=new WebSocketServer({noServer:true,maxPayload:4096});
server.on('upgrade',(req,socket,head)=>{
 const url=new URL(req.url,'http://localhost');
 if(req.headers.origin!=='https://nourish-camera-orion.vercel.app'||
    !validPreview(url,process.env.FRIDGE_DEVICE_KEY)){
  socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');return;
 }
 if(wss.clients.size>=8){socket.end('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n');return;}
 wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,url));
});
wss.on('connection',async(ws,url)=>{
 const controller=new AbortController();
 const expiryTimer=setTimeout(()=>ws.close(1000,'Renew preview'),Number(url.searchParams.get('expires'))-Date.now());
 ws.on('error',()=>{});ws.on('close',()=>{controller.abort();clearTimeout(expiryTimer);});
 let previous='';
 while(ws.readyState===WebSocket.OPEN){
  const started=performance.now();
  try{
   // A slow viewer drops frames rather than building a backlog.
   if(ws.bufferedAmount<60000){
    const r=await fetch('http://127.0.0.1:3201'+url.pathname,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(2000)])});
    if(r.ok){
     const captured=r.headers.get('x-frame-at'),image=Buffer.from(await r.arrayBuffer());
     if(captured!==previous&&image.length&&ws.readyState===WebSocket.OPEN){previous=captured;ws.send(image,{binary:true});}
    }else await new Promise(resolve=>setTimeout(resolve,250));
   }
  }catch{if(controller.signal.aborted)break;await new Promise(resolve=>setTimeout(resolve,250));}
  await new Promise(resolve=>setTimeout(resolve,Math.max(1,1000/30-(performance.now()-started))));
 }
 clearTimeout(expiryTimer);controller.abort();
});
server.listen(3210,'127.0.0.1',()=>console.log('Authenticated hardware gateway ready on localhost:3210'));
