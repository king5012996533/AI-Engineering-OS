// Protocol — AI Engineering OS
// Artifact Protocol: versioned outputs produced by agents.

import { z } from "zod";

export const ArtifactType = z.enum(["plan", "code_diff", "file_content", "test_result", "review_report", "patch"]);
export type ArtifactType = z.infer<typeof ArtifactType>;

export const Artifact = z.object({
  id: z.string(),
  type: ArtifactType,
  taskId: z.string(),
  agentId: z.string(),
  label: z.string(),
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
