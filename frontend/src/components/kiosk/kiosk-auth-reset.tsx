"use client";
import { useClerk } from "@clerk/nextjs";
import { useEffect, useRef } from "react";
export function KioskAuthReset({cycle,onDone,onError}:{cycle:number;onDone:()=>void;onError:(s:string)=>void}){
 const { signOut }=useClerk();const last=useRef(0);
 useEffect(()=>{if(!cycle||last.current===cycle)return;last.current=cycle;void signOut().then(onDone).catch(()=>onError("Could not clear sign-in. Please sign out before the next donor."));},[cycle,signOut,onDone,onError]);
 return null;
}
