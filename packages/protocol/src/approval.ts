// Protocol — AI Engineering OS
// Approval Protocol: human-in-the-loop decisions.

import { z } from "zod";

export const Decision = z.enum(["approved", "rejected", "changes_requested"]);
export type Decision = z.infer<typeof Decision>;

export const ApprovalRequest = z.object({
  id: z.string(),
  taskId: z.string(),
  artifactId: z.string(),
  summary: z.string(),
  diff: z.string().optional(),
  requestedAt: z.number(),
  decidedBy: z.string().optional(),
  decision: Decision.optional(),
  feedback: z.string().optional(),
  decidedAt: z.number().optional(),
});
export type ApprovalRequest = z.infer<typeof ApprovalRequest>;

export type ApprovalProtocol = {
  request: (taskId: string, artifactId: string, summary: string, diff?: string) => Promise<ApprovalRequest>;
  decide: (requestId: string, decision: Decision, feedback?: string) => Promise<void>;
  pending: () => Promise<ApprovalRequest[]>;
};
