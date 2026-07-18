import { getCommandTask } from "@aieos/server";
import { NextResponse } from "next/server";

export async function GET(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const task = getCommandTask(taskId);

  if (!task) {
    return NextResponse.json({ error: "task not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const sent = new Set<string>();

      for (const event of task.events) {
        sent.add(event.id);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      heartbeat = setInterval(() => {
        const snapshot = getCommandTask(taskId);
        for (const event of snapshot?.events ?? []) {
          if (!sent.has(event.id)) {
            sent.add(event.id);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          }
        }
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, 800);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
