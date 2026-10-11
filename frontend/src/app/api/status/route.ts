import { NextResponse } from "next/server";
import { integrationStatus } from "@/lib/integrations/status";

export function GET() {
  return NextResponse.json(integrationStatus());
}
