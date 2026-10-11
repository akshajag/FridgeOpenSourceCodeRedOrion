import {createHmac,timingSafeEqual} from 'node:crypto';
export function validPreview(url,key,now=Date.now()){
 const expiry=url.searchParams.get('expires'),sig=url.searchParams.get('signature');
 if(!key||!/^\/preview\/(front|shelf)$/.test(url.pathname)||!/^\d+$/.test(expiry||'')||Number(expiry)<=now||Number(expiry)>now+95000||!sig)return false;
 const expected=createHmac('sha256',key).update(url.pathname+'.'+expiry).digest('hex');
 const a=Buffer.from(sig),b=Buffer.from(expected);
 return a.length===b.length&&timingSafeEqual(a,b);
}
