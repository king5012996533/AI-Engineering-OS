// Protocol — AI Engineering OS
// Event Protocol: structured event stream for all system activity.

import { z } from "zod";

// ─── Event ───────────────────────────────────────────────────

export const EventSource = z.enum(["agent", "tool", "user", "system"]);
export type EventSource = z.infer<typeof EventSource>;

export const SystemEvent = z.object({
  id: z.string(),
  type: z.string(),
  source: EventSource,
  timestamp: z.number(),
  payload: z.unknown().optional(),
  traceId: z.string(),
  parentEventId: z.string().optional(),
});
export type SystemEvent = z.infer<typeof SystemEvent>;

// ─── Event Store ─────────────────────────────────────────────

export type EventStore = {
  append(event: SystemEvent): Promise<void>;
  query(filter: { traceId?: string; source?: EventSource; type?: string }): Promise<SystemEvent[]>;
  replay(traceId: string): AsyncIterable<SystemEvent>;
};
