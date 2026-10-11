import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { trustedHost, DEVICE_COOKIE, deviceTicket } from "@/lib/hardware/device";
export const runtime="nodejs";
let attempts=0;let windowStart=Date.now();
export async function POST(req:Request){
 const host=req.headers.get("host");const origin=req.headers.get("origin");
 if(process.env.FRIDGE_HARDWARE_MODE!=="1"||!trustedHost(host)||!origin||new URL(origin).host!==host)return NextResponse.json({error:"Same-network access required"},{status:403});
 if(Date.now()-windowStart>60000){attempts=0;windowStart=Date.now();}
 if(++attempts>10)return NextResponse.json({error:"Wait a minute before trying again"},{status:429});
 const nativeForm=req.headers.get("content-type")?.includes("application/x-www-form-urlencoded");
 const body=nativeForm?Object.fromEntries(await req.formData()):await req.json().catch(()=>({}));const expected=process.env.FRIDGE_DEVICE_PAIR_CODE;
 const code=typeof body.code==="string"?body.code:"";
 if(!expected||!process.env.FRIDGE_DEVICE_KEY||Buffer.byteLength(code)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(code),Buffer.from(expected)))return NextResponse.json({error:"Incorrect device code"},{status:401});
 (await cookies()).set(DEVICE_COOKIE,deviceTicket(),{httpOnly:true,sameSite:"strict",path:"/",maxAge:28800});
 if(nativeForm){const target=typeof body.next==="string"&&(body.next==="/kiosk"||body.next.startsWith("/dashboard/"))?body.next:"/dashboard/operator";return NextResponse.redirect(new URL(target,origin),303);}
 return NextResponse.json({ok:true});
}
