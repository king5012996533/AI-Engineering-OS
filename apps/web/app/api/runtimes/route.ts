import { listRuntimeProviders } from "@aieos/server";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(listRuntimeProviders());
}
