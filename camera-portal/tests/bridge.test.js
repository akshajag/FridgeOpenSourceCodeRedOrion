import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createHmac} from 'node:crypto';
import handler from '../api/bridge.js';
class Reply extends EventEmitter {
 constructor(){super();this.chunks=[];this.headers={};}
 setHeader(k,v){this.headers[k]=v;}
 status(v){this.code=v;return this;}
 json(v){this.body=v;}
 flushHeaders(){this.headersSent=true;}
 write(v){this.chunks.push(v);return true;}
 end(v){if(v)this.chunks.push(v);this.ended=true;}
}
test('camera stream requires pairing and passes live multipart chunks without buffering',async()=>{
 const original=globalThis.fetch;
 process.env.FRIDGE_DEVICE_KEY='test-only';process.env.FRIDGE_CAMERA_BASE_URL='https://example.test/camera';process.env.FRIDGE_DATA_TOKEN='test-token';
 let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('--frame\r\nContent-Type: image/jpeg\r\n\r\nJPEG1'));c.enqueue(new TextEncoder().encode('\r\n--frame\r\nContent-Type: image/jpeg\r\n\r\nJPEG2'));c.close();}}),{headers:{'content-type':'multipart/x-mixed-replace; boundary=frame'}});};
 try{
  const anonymous=new Reply();await handler({method:'GET',query:{path:'stream/front'},headers:{}},anonymous);assert.equal(anonymous.code,401);assert.equal(calls,0);
  const expiry=String(Date.now()+60000),sig=createHmac('sha256','test-only').update(expiry).digest('hex');
  const reply=new Reply();await handler({method:'GET',query:{path:'stream/shelf'},headers:{cookie:`nourish-camera=${expiry}.${sig}`}},reply);
  assert.equal(reply.code,200);assert.match(reply.headers['Content-Type'],/multipart/);assert.equal(reply.chunks.length,2);assert.match(Buffer.concat(reply.chunks).toString(),/JPEG1[\s\S]*JPEG2/);assert.equal(reply.ended,true);
 }finally{globalThis.fetch=original;}
});
