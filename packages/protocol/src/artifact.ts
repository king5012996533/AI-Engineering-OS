// Protocol — AI Engineering OS
// Artifact Protocol: versioned outputs produced by agents.

import { z } from "zod";
import { RiskLevel } from "./policy.js";

export const ArtifactType = z.enum(["plan", "code_diff", "file_content", "test_result", "review_report", "patch"]);
export type ArtifactType = z.infer<typeof ArtifactType>;

export const ArtifactLifecycleState = z.enum([
  "created",
  "review_required",
  "approved",
  "rejected",
  "applied",
  "archived",
]);
export type ArtifactLifecycleState = z.infer<typeof ArtifactLifecycleState>;

export const ArtifactApprovalState = z.enum(["not_required", "pending", "approved", "rejected", "changes_requested"]);
export type ArtifactApprovalState = z.infer<typeof ArtifactApprovalState>;

export const Artifact = z.object({
  id: z.string(),
  type: ArtifactType,
  taskId: z.string(),
  agentId: z.string(),
  label: z.string(),
  source: z.string().optional(),
  risk: RiskLevel.optional(),
  lifecycleState: ArtifactLifecycleState.default("created"),
  approvalState: ArtifactApprovalState.default("not_required"),
  data: z.unknown(),
  version: z.number().default(1),
  parentId: z.string().optional(),
  createdAt: z.number(),
});
export type Artifact = z.infer<typeof Artifact>;

export type ArtifactStore = {
  save(artifact: Artifact): Promise<void>;
  get(id: string): Promise<Artifact | null>;
  listByTask(taskId: string): Promise<Artifact[]>;
};
