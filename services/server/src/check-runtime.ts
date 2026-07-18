import type { RuntimeTask, TaskNode } from "@aieos/protocol";
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

const input: RuntimeTask = {
  task,
  goal: "Prove Task -> Runtime -> Event -> Artifact flow",
  workspacePath: process.cwd(),
  traceId: "trace_runtime_check",
};

const manager = new RuntimeManager();
manager.register(new MockRuntime());

const result = await manager.stream("mock-runtime", input, (event) => {
  console.log(JSON.stringify(event));
});

console.log(JSON.stringify({ status: result.status, artifacts: result.artifacts.length }, null, 2));
