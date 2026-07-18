import { z } from "zod";
import type { Artifact } from "./artifact.js";
import { TaskNode } from "./task.js";

export const RuntimeId = z.string().min(1);
export type RuntimeId = z.infer<typeof RuntimeId>;

export const RuntimeKind = z.enum(["mock", "grok-build", "openai-compatible", "anthropic", "local"]);
export type RuntimeKind = z.infer<typeof RuntimeKind>;

export const SandboxProfile = z.enum(["off", "workspace", "read-only", "strict"]);
export type SandboxProfile = z.infer<typeof SandboxProfile>;

export const RuntimeContext = z.object({
  traceId: z.string().min(1),
  workspacePath: z.string().min(1),
  sandboxProfile: SandboxProfile.default("workspace"),
  metadata: z.record(z.unknown()).optional(),
});
export type RuntimeContext = z.infer<typeof RuntimeContext>;

export const ToolCallTask = z.object({
  task: TaskNode,
  goal: z.string(),
  instructions: z.string(),
  context: z.record(z.unknown()).optional(),
});
export type ToolCallTask = z.infer<typeof ToolCallTask>;

export const RuntimeEventType = z.enum([
  "runtime.initialized",
  "runtime.turn.started",
  "runtime.thought",
  "runtime.text",
  "runtime.tool.requested",
  "runtime.tool.approved",
  "runtime.tool.denied",
  "runtime.tool.completed",
  "runtime.diff.extracted",
  "runtime.turn.completed",
  "runtime.turn.failed",
  "runtime.partial",
  "runtime.teardown",
  "run.created",
  "run.completed",
  "artifact.review_required",
  "artifact.approved",
  "artifact.applied",
  "artifact.archived",
]);
export type RuntimeEventType = z.infer<typeof RuntimeEventType>;

export const RuntimeEvent = z.object({
  id: z.string(),
  runtimeId: RuntimeId,
  type: RuntimeEventType,
  timestamp: z.number(),
  traceId: z.string(),
  taskId: z.string().optional(),
  payload: z.unknown().optional(),
  raw: z.unknown().optional(),
});
export type RuntimeEvent = z.infer<typeof RuntimeEvent>;

export const RuntimeDiffStatus = z.enum(["empty", "proposed", "partial", "failed"]);
export type RuntimeDiffStatus = z.infer<typeof RuntimeDiffStatus>;

export type RuntimeDiffArtifact = Artifact & {
  source?: string;
  risk?: RuntimeDiffRisk;
  lifecycleState?: RuntimeDiffLifecycleState;
  approvalState?: RuntimeDiffApprovalState;
  data: {
    patch: string;
    status: RuntimeDiffStatus;
    diffCommand: string;
    notes?: string;
    workspacePath?: string;
    sandboxPath?: string;
    changedFile?: string;
    appliedAt?: number;
  };
};

export type RuntimeDiffRisk = "low" | "medium" | "high";
export type RuntimeDiffLifecycleState = "created" | "review_required" | "approved" | "rejected" | "applied" | "archived";
export type RuntimeDiffApprovalState = "not_required" | "pending" | "approved" | "rejected" | "changes_requested";

export type AgentRuntime = {
  id: RuntimeId;
  kind: RuntimeKind;
  initialize(context: RuntimeContext): Promise<void>;
  executeTurn(task: ToolCallTask): AsyncIterable<RuntimeEvent>;
  extractDiff(): Promise<RuntimeDiffArtifact>;
  teardown(): Promise<void>;
};
