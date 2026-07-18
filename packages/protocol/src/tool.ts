import { z } from "zod";

export const ToolPermission = z.enum(["read", "write", "execute"]);
export type ToolPermission = z.infer<typeof ToolPermission>;

export const ToolCallStatus = z.enum(["requested", "approved", "denied", "completed", "failed"]);
export type ToolCallStatus = z.infer<typeof ToolCallStatus>;

export const ToolCallRequest = z.object({
  id: z.string(),
  tool: z.string(),
  permission: ToolPermission,
  taskId: z.string(),
  traceId: z.string(),
  input: z.unknown(),
  reason: z.string().optional(),
});
export type ToolCallRequest = z.infer<typeof ToolCallRequest>;

export const ToolCallResult = z.object({
  id: z.string(),
  requestId: z.string(),
  status: ToolCallStatus,
  output: z.unknown().optional(),
  error: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type ToolCallResult = z.infer<typeof ToolCallResult>;

export type ToolExecutionLayer = {
  execute(request: ToolCallRequest): Promise<ToolCallResult>;
};
