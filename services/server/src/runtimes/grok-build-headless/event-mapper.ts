// Grok Build Headless Bridge — Event Mapper
//
// Maps newline-delimited streaming-json events from `grok -p` into the
// AI Engineering OS RuntimeEvent shape. Tolerant of unknown event types:
// they are preserved as raw-payload events so nothing is silently dropped.

import type { RuntimeEvent } from "@aieos/protocol";
import type { GrokStreamingEvent } from "./command.js";

const now = () => Date.now();
const id = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

export type MapperDeps = {
  runtimeId: string;
  traceId: string;
  taskId?: string;
};

export type MappedEvent =
  | { kind: "event"; event: RuntimeEvent }
  | { kind: "end"; stopReason?: string; sessionId?: string; usage?: unknown }
  | { kind: "error"; message: string; usage?: unknown }
  | { kind: "max_turns" };

/**
 * Try to parse one streaming-json line. Returns null for blank/comment lines
 * so the adapter can skip them without surfacing a parse error.
 */
export function parseStreamingLine(line: string): GrokStreamingEvent | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as GrokStreamingEvent;
  } catch {
    // Grok may print non-JSON to stdout on crash. Preserve as an opaque event
    // so the operator sees it in the audit log rather than a silent drop.
    return { type: "__unparseable__", raw: trimmed };
  }
}

/**
 * Map a single parsed Grok streaming event into zero or more RuntimeEvents
 * plus a control signal (end / error / max_turns) that the adapter acts on.
 */
export function mapGrokEvent(event: GrokStreamingEvent, deps: MapperDeps): MappedEvent[] {
  const base = {
    id: id("evt"),
    runtimeId: deps.runtimeId,
    timestamp: now(),
    traceId: deps.traceId,
    taskId: deps.taskId,
  };

  switch (event.type) {
    case "text":
      return [
        {
          kind: "event",
          event: { ...base, type: "runtime.text", payload: { text: event.data } },
        },
      ];

    case "thought":
      return [
        {
          kind: "event",
          event: { ...base, type: "runtime.thought", payload: { text: event.data } },
        },
      ];

    case "end":
      return [
        {
          kind: "event",
          event: {
            ...base,
            type: "runtime.turn.completed",
            payload: {
              stopReason: event.stopReason,
              sessionId: event.sessionId,
              requestId: event.requestId,
              usage: event.usage,
              numTurns: event.num_turns,
            },
          },
        },
        {
          kind: "end",
          stopReason: event.stopReason,
          sessionId: event.sessionId,
          usage: event.usage,
        },
      ];

    case "error":
      return [
        {
          kind: "event",
          event: { ...base, type: "runtime.turn.failed", payload: { message: event.message } },
        },
        { kind: "error", message: event.message, usage: event.usage },
      ];

    case "max_turns_reached":
      return [
        {
          kind: "event",
          event: { ...base, type: "runtime.partial", payload: { reason: "max_turns_reached" } },
        },
        { kind: "max_turns" },
      ];

    case "auto_compact_started":
      return [
        {
          kind: "event",
          event: {
            ...base,
            type: "runtime.partial",
            payload: { reason: "auto_compact_started", percentage: event.percentage },
          },
        },
      ];

    case "auto_compact_completed":
    case "auto_compact_cancelled":
      return [];

    case "auto_compact_failed":
      return [
        {
          kind: "event",
          event: {
            ...base,
            type: "runtime.partial",
            payload: { reason: "auto_compact_failed", error: event.error },
          },
        },
      ];

    case "auto_continue_completed":
      return [
        {
          kind: "event",
          event: {
            ...base,
            type: "runtime.partial",
            payload: { reason: "auto_continue_completed", totalTokens: event.total_tokens },
          },
        },
      ];

    case "image_compressed":
      return [
        {
          kind: "event",
          event: { ...base, type: "runtime.partial", payload: { reason: "image_compressed", message: event.message } },
        },
      ];

    case "__unparseable__":
      return [
        {
          kind: "event",
          event: {
            ...base,
            type: "runtime.partial",
            payload: { reason: "unparseable_stdout", raw: (event as { raw: string }).raw },
          },
        },
      ];

    default:
      // Unknown event types are preserved verbatim. The mapper is intentionally
      // open-ended so a future Grok release adding new event types does not
      // silently lose information.
      return [
        {
          kind: "event",
          event: {
            ...base,
            type: "runtime.partial",
            payload: { reason: "unknown_event", type: event.type, raw: event },
          },
        },
      ];
  }
}
