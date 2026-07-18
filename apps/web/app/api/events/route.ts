import { listEventLog } from "@aieos/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const taskId = url.searchParams.get("taskId") ?? undefined;
  const traceId = url.searchParams.get("traceId") ?? undefined;
  const runtimeId = url.searchParams.get("runtimeId") ?? undefined;
  const type = url.searchParams.get("type") ?? undefined;

  return NextResponse.json(listEventLog({ taskId, traceId, runtimeId, type }));
}
