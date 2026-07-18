import { z } from "zod";

export const ProjectDecision = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  sourceTaskId: z.string().optional(),
  createdAt: z.number(),
});
export type ProjectDecision = z.infer<typeof ProjectDecision>;

export const ProjectMemory = z.object({
  id: z.string(),
  name: z.string(),
  workspacePath: z.string().optional(),
  goals: z.array(z.string()).default([]),
  decisions: z.array(ProjectDecision).default([]),
  artifactIds: z.array(z.string()).default([]),
  taskIds: z.array(z.string()).default([]),
  reviews: z.array(z.string()).default([]),
  history: z.array(z.string()).default([]),
  updatedAt: z.number(),
});
export type ProjectMemory = z.infer<typeof ProjectMemory>;

