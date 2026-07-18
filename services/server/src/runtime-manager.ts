import type { AgentRuntime, RuntimeEventCallback, RuntimeResult, RuntimeTask } from "@aieos/protocol";

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

  execute(runtimeId: string, input: RuntimeTask): Promise<RuntimeResult> {
    return this.get(runtimeId).execute(input);
  }

  stream(runtimeId: string, input: RuntimeTask, callback: RuntimeEventCallback): Promise<RuntimeResult> {
    return this.get(runtimeId).stream(input, callback);
  }
}
