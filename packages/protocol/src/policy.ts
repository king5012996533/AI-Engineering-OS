import { z } from "zod";

export const RiskLevel = z.enum(["low", "medium", "high"]);
export type RiskLevel = z.infer<typeof RiskLevel>;

export const ApprovalPolicy = z.object({
  id: z.string(),
  artifactType: z.string().min(1),
  riskLevel: RiskLevel,
  requiresHuman: z.boolean(),
  reason: z.string(),
});
export type ApprovalPolicy = z.infer<typeof ApprovalPolicy>;
