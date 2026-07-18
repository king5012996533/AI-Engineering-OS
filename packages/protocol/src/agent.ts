// Protocol — AI Engineering OS
// Agent Protocol: how agents register, discover capabilities, and communicate.

import { z } from "zod";

// ─── Agent Identity ──────────────────────────────────────────

export const AgentId = z.string().min(1);
export type AgentId = z.infer<typeof AgentId>;

export const Permission = z.enum(["read", "write", "execute"]);
export type Permission = z.infer<typeof Permission>;

// ─── Agent Definition ────────────────────────────────────────

export const AgentCapability = z.object({
  name: z.string(),
  description: z.string(),
  permissions: z.array(Permission),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.record(z.unknown()),
});
export type AgentCapability = z.infer<typeof AgentCapability>;

export const AgentDefinition = z.object({
  id: AgentId,
  name: z.string(),
  role: z.enum(["planner", "architect", "developer", "reviewer", "tester", "devops"]),
  permissions: z.array(Permission),
  tools: z.array(z.string()),
  systemPrompt: z.string(),
  model: z.string().optional(),
});
export type AgentDefinition = z.infer<typeof AgentDefinition>;

// ─── Agent Messages ──────────────────────────────────────────

export const AgentMessageType = z.enum(["task_assigned", "tool_call", "tool_result", "status_change", "error"]);
export type AgentMessageType = z.infer<typeof AgentMessageType>;

export const AgentMessage = z.object({
  type: AgentMessageType,
  agentId: z.string(),
  taskId: z.string(),
  payload: z.unknown(),
  timestamp: z.number(),
});
export type AgentMessage = z.infer<typeof AgentMessage>;
