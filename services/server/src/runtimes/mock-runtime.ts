import type { AgentRuntime, Artifact, RuntimeResult, RuntimeTask, SystemEvent } from "@aieos/protocol";

const now = () => Date.now();
const id = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

export class MockRuntime implements AgentRuntime {
  readonly id = "mock-runtime";
  readonly kind = "mock";

  async execute(input: RuntimeTask): Promise<RuntimeResult> {
    const events: SystemEvent[] = [];
    return this.stream(input, async (event) => {
      events.push(event);
    }).then((result) => ({ ...result, events }));
  }

  async stream(input: RuntimeTask, callback: (event: SystemEvent) => void | Promise<void>): Promise<RuntimeResult> {
    const events: SystemEvent[] = [];
    const emit = async (type: string, payload?: unknown) => {
      const event: SystemEvent = {
        id: id("evt"),
        type,
        source: "agent",
        timestamp: now(),
        traceId: input.traceId,
        payload,
      };
      events.push(event);
      await callback(event);
    };

    await emit("runtime.started", {
      runtimeId: this.id,
      taskId: input.task.id,
      workspacePath: input.workspacePath,
    });

    await emit("runtime.text", {
      text: `Mock runtime received task: ${input.task.description}`,
    });

    const patch = [
      "diff --git a/README.md b/README.md",
      "--- a/README.md",
      "+++ b/README.md",
      "@@ -1,3 +1,5 @@",
      " # AI Engineering OS",
      "+",
      `+Mock runtime planned task: ${input.task.description}`,
    ].join("\n");

    const artifact: Artifact = {
      id: id("art"),
      type: "patch",
      taskId: input.task.id,
      agentId: "developer.mock",
      label: "Mock patch proposal",
      data: { patch },
      version: 1,
      createdAt: now(),
    };

    await emit("artifact.created", {
      artifactId: artifact.id,
      artifactType: artifact.type,
      label: artifact.label,
    });

    await emit("runtime.completed", {
      runtimeId: this.id,
      taskId: input.task.id,
      artifactId: artifact.id,
    });

    return {
      runtimeId: this.id,
      taskId: input.task.id,
      status: "completed",
      summary: "Mock runtime completed and produced a patch artifact.",
      artifacts: [artifact],
      events,
    };
  }
}
