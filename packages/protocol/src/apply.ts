import { z } from "zod";

export const ApplyStatus = z.enum(["applied", "failed"]);
export type ApplyStatus = z.infer<typeof ApplyStatus>;

export const ApplyAuditRecord = z.object({
  id: z.string(),
  taskId: z.string(),
  artifactId: z.string(),
  approvalId: z.string().optional(),
  approvedBy: z.string().optional(),
  appliedBy: z.string(),
  workspacePath: z.string(),
  beforeCommit: z.string().optional(),
  afterCommit: z.string().optional(),
  status: ApplyStatus,
  appliedAt: z.number(),
  error: z.string().optional(),
});
export type ApplyAuditRecord = z.infer<typeof ApplyAuditRecord>;
