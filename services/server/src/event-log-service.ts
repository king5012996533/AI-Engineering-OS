import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { RuntimeEvent } from "@aieos/protocol";

type EventLogState = {
  events: RuntimeEvent[];
};

export type EventLogQuery = {
  taskId?: string;
  traceId?: string;
  runtimeId?: string;
  type?: string;
};

const statePath = resolve(process.cwd(), ".aieos", "event-log.json");
const eventLog: RuntimeEvent[] = [];
let hydrated = false;

export function appendEventLog(event: RuntimeEvent): RuntimeEvent {
  hydrateEventLog();
  if (!eventLog.some((item) => item.id === event.id)) {
    eventLog.push(event);
    persistEventLog();
  }
  return event;
}

export function listEventLog(query: EventLogQuery = {}): RuntimeEvent[] {
  hydrateEventLog();
  return eventLog.filter((event) => {
    if (query.taskId && event.taskId !== query.taskId) {
      return false;
    }
    if (query.traceId && event.traceId !== query.traceId) {
      return false;
    }
    if (query.runtimeId && event.runtimeId !== query.runtimeId) {
      return false;
    }
    if (query.type && event.type !== query.type) {
      return false;
    }
    return true;
  });
}

export function seedEventLog(events: RuntimeEvent[]): void {
  hydrateEventLog();
  let changed = false;
  for (const event of events) {
    if (!eventLog.some((item) => item.id === event.id)) {
      eventLog.push(event);
      changed = true;
    }
  }
  if (changed) {
    persistEventLog();
  }
}

function hydrateEventLog(): void {
  if (hydrated) {
    return;
  }
  hydrated = true;

  if (!existsSync(statePath)) {
    return;
  }

  const raw = readFileSync(statePath, "utf8");
  if (!raw.trim()) {
    return;
  }

  const state = JSON.parse(raw) as EventLogState;
  eventLog.splice(0, eventLog.length, ...(state.events ?? []));
}

function persistEventLog(): void {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify({ events: eventLog }, null, 2));
}
