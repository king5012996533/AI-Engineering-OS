import { createCommandTask } from "@aieos/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { prompt?: string; workspacePath?: string } | null;
  const prompt = body?.prompt?.trim();

  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const task = await createCommandTask({
    prompt,
    workspacePath: body?.workspacePath,
  });

  return NextResponse.json(task);
}
