import {Connect} from "@/components/kiosk/device-connect";
export default async function Page({searchParams}:{searchParams:Promise<{next?:string}>}){const {next}=await searchParams;const target=next==="/kiosk"||next?.startsWith("/dashboard/")?next:"/dashboard/operator";return <Connect target={target}/>;}
