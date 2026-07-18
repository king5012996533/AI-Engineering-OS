// Protocol — AI Engineering OS
// Task Protocol: the contract for how work is defined, assigned, and tracked.

import { z } from "zod";

// ─── Task Identity ───────────────────────────────────────────

export const TaskId = z.string().min(1);
export type TaskId = z.infer<typeof TaskId>;

// ─── Agent Role ──────────────────────────────────────────────

export const AgentRole = z.enum(["planner", "developer", "reviewer"]);
export type AgentRole = z.infer<typeof AgentRole>;

// ─── Task Status ─────────────────────────────────────────────

export const TaskStatus = z.enum([
  "pending",
  "assigned",
  "in_progress",
  "awaiting_review",
  "in_review",
  "changes_requested",
  "awaiting_approval",
  "approved",
  "rejected",
  "failed",
]);
export type TaskStatus = z.infer<typeof TaskStatus>;

// ─── Task Node ───────────────────────────────────────────────

export const TaskNode = z.object({
  id: TaskId,
  description: z.string(),
  agent: AgentRole,
  status: TaskStatus,
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  error: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type TaskNode = z.infer<typeof TaskNode>;

// ─── Task Graph ──────────────────────────────────────────────

/** A dependency graph of tasks produced by the Planner */
export const TaskGraph = z.object({
  goal: z.string(),
  tasks: z.array(TaskNode),
  /** [fromTaskId, toTaskId] — from must complete before to begins */
  dependencies: z.array(z.tuple([z.string(), z.string()])),
});
export type TaskGraph = z.infer<typeof TaskGraph>;

// ─── Events ──────────────────────────────────────────────────

export const TaskEventType = z.enum([
  "task.created",
  "task.assigned",
  "task.in_progress",
  "task.tool_call",
  "task.tool_result",
  "task.completed",
  "task.review_started",
  "task.review_passed",
  "task.review_failed",
  "task.approved",
  "task.rejected",
  "task.failed",
]);
export type TaskEventType = z.infer<typeof TaskEventType>;

export const TaskEvent = z.object({
  id: z.string(),
  type: TaskEventType,
  taskId: z.string(),
  agentId: z.string().optional(),
  timestamp: z.number(),
  payload: z.unknown().optional(),
});
export type TaskEvent = z.infer<typeof TaskEvent>;
