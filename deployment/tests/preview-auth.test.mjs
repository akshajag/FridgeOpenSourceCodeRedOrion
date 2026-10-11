import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {validPreview} from '../preview-auth.mjs';
test('preview tokens expire and cannot authorize another camera or API route',()=>{
 const now=100000,key='test-key',expiry=String(now+90000);
 const signature=createHmac('sha256',key).update('/preview/front.'+expiry).digest('hex');
 const url=new URL('https://example.test/preview/front');url.searchParams.set('expires',expiry);url.searchParams.set('signature',signature);
 assert.equal(validPreview(url,key,now),true);
 assert.equal(validPreview(url,key,now+90001),false);
 url.pathname='/preview/shelf';assert.equal(validPreview(url,key,now),false);
 url.pathname='/data/inventory';assert.equal(validPreview(url,key,now),false);
 url.pathname='/preview/front';url.searchParams.set('signature','invalid');assert.equal(validPreview(url,key,now),false);
});
