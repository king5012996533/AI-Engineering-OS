import { z } from "zod";

export const RunStatus = z.enum(["queued", "running", "completed", "partial", "failed", "applied"]);
export type RunStatus = z.infer<typeof RunStatus>;

export const RunRecord = z.object({
  id: z.string(),
  taskId: z.string(),
  runtimeId: z.string(),
  workspacePath: z.string().optional(),
  sandboxPath: z.string().optional(),
  status: RunStatus,
  startedAt: z.number(),
  completedAt: z.number().optional(),
  appliedAt: z.number().optional(),
  artifactId: z.string().optional(),
  error: z.string().optional(),
});
export type RunRecord = z.infer<typeof RunRecord>;
