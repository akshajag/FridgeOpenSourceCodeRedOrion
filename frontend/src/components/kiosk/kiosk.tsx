"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Camera, Mic, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/shared/panel";
import { Logo } from "@/components/shared/logo";
import { clearDemoPersonaCookie } from "@/lib/auth/demo-cookie";
const AuthReset = dynamic(() => import("./kiosk-auth-reset").then(m => m.KioskAuthReset), { ssr: false });
type State = { epoch: string; active: boolean; status: string; agent: string; user: string; notice: string; product: string; donation: string };
export function Kiosk() {
  const [state,setState]=useState<State|null>(null);
  const [error,setError]=useState("");const [busy,setBusy]=useState(false);const [text,setText]=useState("");const [authReset,setAuthReset]=useState(0);const [authBusy,setAuthBusy]=useState(false);
  const epoch=useRef<string|null>(null);const hadDonor=useRef(false);
  const clerk=Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  useEffect(()=>{
    let cancelled=false;let pending=false;
    const poll=async()=>{
      if(pending)return;pending=true;
      try {
        const r=await fetch("/api/kiosk/state",{cache:"no-store"});
        if(!r.ok)throw new Error((await r.json()).error??"Fridge service unavailable");
        const next:State=await r.json();if(cancelled)return;
        if(epoch.current && epoch.current!==next.epoch && hadDonor.current){
          hadDonor.current=false;setText("");clearDemoPersonaCookie();
          await fetch("/api/kiosk/reset-auth",{method:"POST"});
          if(clerk){setAuthBusy(true);setAuthReset(x=>x+1);}
        }
        epoch.current=next.epoch;hadDonor.current=hadDonor.current||next.active;
        setState(next);setError("");

      } catch(e){if(!cancelled)setError((e as Error).message);}finally{pending=false;}
    };
    void poll();const timer=setInterval(()=>void poll(),1000);return()=>{cancelled=true;clearInterval(timer);};
  },[clerk]);
  async function command(action:string,body:object={}){
    setBusy(true);setError("");
    try {const r=await fetch(`/api/kiosk/${action}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error??"Action failed");if(action==="begin"){setState(data);epoch.current=data.epoch;hadDonor.current=true;}if(action==="say")setText("");}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <div className="min-h-screen bg-background">
    {clerk&&<AuthReset cycle={authReset} onDone={()=>setAuthBusy(false)} onError={setError}/>}
    <header className="flex items-center justify-between border-b px-6 py-4"><Logo/><span className="text-sm text-primary">Nourish · Donation kiosk</span></header>
    <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <div><div className="mb-2 text-sm font-medium text-primary">Fridge donation terminal</div><h1 className="text-3xl font-semibold">{state?.active?"Let’s check in your donation":"Good food. Shared with everyone."}</h1><p className="mt-2 text-muted-foreground">Show your item to the front camera, talk to Nourish, then place it inside when asked.</p></div>
      {error&&<p role="alert" className="rounded-lg border border-critical/30 bg-critical-soft p-4">{error}</p>}
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4"><Panel><PanelHeader title="Show your donation"/><PanelBody><CameraView side="front" /><p className="mt-3 text-sm text-muted-foreground"><Camera className="mr-1 inline size-4"/>Turn the barcode or stamped date toward this camera when asked.</p></PanelBody></Panel>
          <Panel><PanelHeader title="Inside the fridge"/><PanelBody><CameraView side="shelf" /><p className="mt-3 text-sm text-muted-foreground">The inside camera verifies a newly placed item before inventory changes.</p></PanelBody></Panel></div>
        <div className="space-y-4"><Panel><PanelHeader title="Nourish voice guide"/><PanelBody><div className="mb-4 flex items-center gap-2 text-primary"><Mic className="size-5"/><span>{state?.status??"Connecting to fridge"}</span></div>
          <p aria-live="polite" className="min-h-24 text-xl leading-relaxed">{state?.agent||(state?.active?"Nourish is connecting…":"Welcome! Ready to donate?")}</p>
          {state?.user&&<p className="mt-3 text-sm text-muted-foreground">You: {state.user}</p>}{state?.product&&<p className="mt-4 rounded-md bg-sage p-3">{state.product}</p>}{state?.notice&&<p role="alert" className="mt-3 text-amber">{state.notice}</p>}{state?.donation&&<p className="mt-3 text-primary"><CheckCircle2 className="mr-1 inline size-4"/>{state.donation}</p>}
          {!state?.active?<Button className="mt-5 w-full" disabled={busy||!state||authBusy} onClick={()=>void command("begin")}>Begin donation</Button>:<><form className="mt-5 flex gap-2" onSubmit={e=>{e.preventDefault();void command("say",{text});}}><input aria-label="Type to Nourish" className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2" value={text} onChange={e=>setText(e.target.value)} placeholder="Or type here…"/><Button disabled={busy||!text.trim()}>Send</Button></form><Button variant="outline" className="mt-3 w-full" disabled={busy} onClick={()=>void command("finish")}>Finish / next donor</Button></>}
          <p className="mt-4 text-xs text-muted-foreground">{clerk?"Sign-in is cleared after each donor session.":"Guest donation · no verified donor sign-in configured."} Say “I’m finished” to return to the welcome screen.</p></PanelBody></Panel>

        </div>
      </div>
    </main>
  </div>;
}
function CameraView({side}:{side:string}){
  const [failed,setFailed]=useState(false);const [retry,setRetry]=useState(0);
  useEffect(()=>{if(!failed)return;const id=setTimeout(()=>{setFailed(false);setRetry(x=>x+1);},2000);return()=>clearTimeout(id);},[failed]);
  return <div className="relative aspect-video overflow-hidden rounded-lg bg-black">{/* Shared Python camera frames; the browser never opens a second reader. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={`/api/kiosk/stream/${side}?retry=${retry}`} alt={side==="front"?"Front donation camera":"Inside fridge camera"} className="h-full w-full object-contain" onLoad={()=>setFailed(false)} onError={()=>setFailed(true)}/>
    {failed&&<div className="absolute inset-0 flex items-center justify-center text-sm text-white">Camera unavailable — check its USB connection.</div>}
  </div>;
}
