import { z } from "zod";
import type { Artifact } from "./artifact.js";
import type { SystemEvent } from "./event.js";
import { TaskNode } from "./task.js";

export const RuntimeId = z.string().min(1);
export type RuntimeId = z.infer<typeof RuntimeId>;

export const RuntimeKind = z.enum(["mock", "grok-build", "openai-compatible", "anthropic", "local"]);
export type RuntimeKind = z.infer<typeof RuntimeKind>;

export const RuntimeTask = z.object({
  task: TaskNode,
  goal: z.string(),
  workspacePath: z.string().min(1),
  traceId: z.string().min(1),
  context: z.record(z.unknown()).optional(),
});
export type RuntimeTask = z.infer<typeof RuntimeTask>;

export const RuntimeResultStatus = z.enum(["completed", "failed", "cancelled"]);
export type RuntimeResultStatus = z.infer<typeof RuntimeResultStatus>;

export const RuntimeResult = z.object({
  runtimeId: RuntimeId,
  taskId: z.string(),
  status: RuntimeResultStatus,
  summary: z.string(),
  artifacts: z.array(z.custom<Artifact>()),
  events: z.array(z.custom<SystemEvent>()),
  error: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type RuntimeResult = z.infer<typeof RuntimeResult>;

export type RuntimeEventCallback = (event: SystemEvent) => void | Promise<void>;

export type AgentRuntime = {
  id: RuntimeId;
  kind: RuntimeKind;
  execute(input: RuntimeTask): Promise<RuntimeResult>;
  stream(input: RuntimeTask, callback: RuntimeEventCallback): Promise<RuntimeResult>;
};
