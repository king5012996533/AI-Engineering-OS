import { getCommandTask } from "@aieos/server";
import { NextResponse } from "next/server";

export async function GET(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const task = getCommandTask(taskId);

  if (!task) {
    return NextResponse.json({ error: "task not found" }, { status: 404 });
  }

  return NextResponse.json(task);
}
