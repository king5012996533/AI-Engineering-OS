import type {
  AgentRuntime,
  RuntimeContext,
  RuntimeDiffArtifact,
  RuntimeEvent,
  ToolCallTask,
} from "@aieos/protocol";

export type RuntimeRunResult = {
  runtimeId: string;
  taskId: string;
  status: "completed" | "failed" | "partial";
  events: RuntimeEvent[];
  artifact: RuntimeDiffArtifact;
  error?: string;
};

export type RuntimeRunOptions = {
  timeoutMs?: number;
};

const DEFAULT_RUNTIME_TIMEOUT_MS = 120_000;

export class RuntimeManager {
  private readonly runtimes = new Map<string, AgentRuntime>();

  register(runtime: AgentRuntime): void {
    if (this.runtimes.has(runtime.id)) {
      throw new Error(`Runtime already registered: ${runtime.id}`);
    }
    this.runtimes.set(runtime.id, runtime);
  }

  get(runtimeId: string): AgentRuntime {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new Error(`Runtime not found: ${runtimeId}`);
    }
    return runtime;
  }

  list(): AgentRuntime[] {
    return [...this.runtimes.values()];
  }

  async executeTurn(
    runtimeId: string,
    context: RuntimeContext,
    task: ToolCallTask,
    options: RuntimeRunOptions = {},
  ): Promise<RuntimeRunResult> {
    const runtime = this.get(runtimeId);
    const events: RuntimeEvent[] = [];
    const timeoutMs = options.timeoutMs ?? DEFAULT_RUNTIME_TIMEOUT_MS;
    let timedOut = false;

    await runtime.initialize(context);

    try {
      const run = async () => {
        for await (const event of runtime.executeTurn(task)) {
          events.push(event);
        }
      };

      await withTimeout(run(), timeoutMs).catch((error) => {
        timedOut = error instanceof RuntimeTimeoutError;
        if (!timedOut) {
          throw error;
        }
      });

      const artifact = await safeExtractDiff(runtime, task, timedOut ? "Runtime timed out before diff extraction." : undefined);
      return {
        runtimeId,
        taskId: task.task.id,
        status: timedOut ? "partial" : "completed",
        events,
        artifact: timedOut ? markArtifactPartial(artifact, "Runtime timed out; captured partial diff.") : artifact,
        error: timedOut ? `Runtime timed out after ${timeoutMs}ms` : undefined,
      };
    } catch (error) {
      const artifact = await safeExtractDiff(
        runtime,
        task,
        error instanceof Error ? error.message : "Runtime failed before diff extraction.",
      );
      return {
        runtimeId,
        taskId: task.task.id,
        status: artifact.data.patch ? "partial" : "failed",
        events,
        artifact: artifact.data.patch
          ? markArtifactPartial(artifact, error instanceof Error ? error.message : "Runtime failed with partial diff.")
          : artifact,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await runtime.teardown();
    }
  }
}

class RuntimeTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Runtime timed out after ${timeoutMs}ms`);
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new RuntimeTimeoutError(timeoutMs)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function markArtifactPartial(artifact: RuntimeDiffArtifact, notes: string): RuntimeDiffArtifact {
  return {
    ...artifact,
    data: {
      ...artifact.data,
      status: "partial",
      notes,
    },
  };
}

async function safeExtractDiff(
  runtime: AgentRuntime,
  task: ToolCallTask,
  fallbackNotes?: string,
): Promise<RuntimeDiffArtifact> {
  try {
    return await runtime.extractDiff();
  } catch (error) {
    return {
      id: `art_${Date.now()}`,
      type: "patch",
      taskId: task.task.id,
      agentId: runtime.id,
      label: "Runtime failed before diff extraction",
      data: {
        patch: "",
        status: "failed",
        diffCommand: "git diff --unified=3",
        notes: fallbackNotes ?? (error instanceof Error ? error.message : String(error)),
      },
      version: 1,
      createdAt: Date.now(),
    };
  }
}
