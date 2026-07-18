import type { RuntimeContext, TaskNode, ToolCallTask } from "@aieos/protocol";
import { RuntimeManager } from "./runtime-manager.js";
import { MockRuntime } from "./runtimes/mock-runtime.js";

const now = Date.now();

const task: TaskNode = {
  id: "task_001",
  description: "Create the first runtime execution bridge",
  agent: "developer",
  status: "assigned",
  createdAt: now,
  updatedAt: now,
};

const context: RuntimeContext = {
  traceId: "trace_runtime_check",
  workspacePath: process.cwd(),
  sandboxProfile: "workspace",
};

const toolCallTask: ToolCallTask = {
  task,
  goal: "Prove Task -> Runtime -> Event -> Artifact flow",
  instructions: "Propose a minimal README patch and emit runtime/tool events.",
};

const manager = new RuntimeManager();
manager.register(new MockRuntime());

const result = await manager.executeTurn("mock-runtime", context, toolCallTask, {
  timeoutMs: 10_000,
});

for (const event of result.events) {
  console.log(JSON.stringify(event));
}

console.log(
  JSON.stringify(
    {
      status: result.status,
      artifactStatus: result.artifact.data.status,
      patchLines: result.artifact.data.patch.split("\n").length,
    },
    null,
    2,
  ),
);
