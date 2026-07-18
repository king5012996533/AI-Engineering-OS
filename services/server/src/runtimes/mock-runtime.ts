import type {
  AgentRuntime,
  RuntimeContext,
  RuntimeDiffArtifact,
  RuntimeEvent,
  RuntimeKind,
  ToolCallTask,
} from "@aieos/protocol";

const now = () => Date.now();
const id = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

export class MockRuntime implements AgentRuntime {
  readonly id = "mock-runtime";
  readonly kind: RuntimeKind = "mock";

  private context: RuntimeContext | null = null;
  private task: ToolCallTask | null = null;
  private patch = "";

  async initialize(context: RuntimeContext): Promise<void> {
    this.context = context;
    this.patch = "";
  }

  async *executeTurn(task: ToolCallTask): AsyncIterable<RuntimeEvent> {
    if (!this.context) {
      throw new Error("Runtime must be initialized before executeTurn.");
    }

    this.task = task;

    yield this.event("runtime.initialized", {
      workspacePath: this.context.workspacePath,
      sandboxProfile: this.context.sandboxProfile,
    });

    yield this.event("runtime.turn.started", {
      taskId: task.task.id,
      instructions: task.instructions,
    });

    yield this.event("runtime.thought", {
      text: "Plan a minimal code change and request a file edit through the OS tool layer.",
    });

    yield this.event("runtime.tool.requested", {
      tool: "file.patch",
      reason: "Mock runtime proposes a README patch instead of mutating the main workspace.",
      input: {
        path: "README.md",
      },
    });

    yield this.event("runtime.tool.approved", {
      tool: "file.patch",
      policy: "mock auto-approval for local smoke test",
    });

    this.patch = [
      "diff --git a/README.md b/README.md",
      "--- a/README.md",
      "+++ b/README.md",
      "@@ -1,3 +1,5 @@",
      " # AI Engineering OS",
      "+",
      `+Mock runtime planned task: ${task.task.description}`,
    ].join("\n");

    yield this.event("runtime.tool.completed", {
      tool: "file.patch",
      output: {
        patchLines: this.patch.split("\n").length,
      },
    });

    yield this.event("runtime.diff.extracted", {
      status: "proposed",
      diffCommand: "git diff --unified=3",
    });

    yield this.event("runtime.turn.completed", {
      taskId: task.task.id,
    });
  }

  async extractDiff(): Promise<RuntimeDiffArtifact> {
    if (!this.task) {
      throw new Error("Cannot extract diff before executeTurn.");
    }

    return {
      id: id("art"),
      type: "patch",
      taskId: this.task.task.id,
      agentId: "developer.mock",
      label: "Mock patch proposal",
      data: {
        patch: this.patch,
        status: this.patch ? "proposed" : "empty",
        diffCommand: "git diff --unified=3",
      },
      version: 1,
      createdAt: now(),
    };
  }

  async teardown(): Promise<void> {
    this.context = null;
    this.task = null;
  }

  private event(type: RuntimeEvent["type"], payload?: unknown): RuntimeEvent {
    if (!this.context) {
      throw new Error("Runtime context is missing.");
    }

    return {
      id: id("evt"),
      runtimeId: this.id,
      type,
      timestamp: now(),
      traceId: this.context.traceId,
      taskId: this.task?.task.id,
      payload,
    };
  }
}
