import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ApprovalRequest, RuntimeDiffArtifact, RuntimeEvent, TaskNode, ToolCallTask } from "@aieos/protocol";
import { RuntimeManager } from "./runtime-manager.js";
import { MockRuntime } from "./runtimes/mock-runtime.js";

export type CommandTaskStatus = "queued" | "running" | "awaiting_approval" | "approved" | "rejected" | "failed";

export type CommandTask = {
  id: string;
  goal: string;
  status: CommandTaskStatus;
  createdAt: number;
  updatedAt: number;
  runtimeId: string;
  artifactId?: string;
  approvalId?: string;
  error?: string;
};

export type CommandTaskSnapshot = CommandTask & {
  events: RuntimeEvent[];
  artifact?: RuntimeDiffArtifact;
  approval?: ApprovalRequest;
};

type CreateTaskInput = {
  prompt: string;
  workspacePath?: string;
};

const manager = new RuntimeManager();
manager.register(new MockRuntime());

const tasks = new Map<string, CommandTask>();
const events = new Map<string, RuntimeEvent[]>();
const artifacts = new Map<string, RuntimeDiffArtifact>();
const approvals = new Map<string, ApprovalRequest>();
const emitter = new EventEmitter();
const statePath = resolve(process.cwd(), ".aieos", "command-center.json");

type PersistedState = {
  tasks: CommandTask[];
  events: Array<[string, RuntimeEvent[]]>;
  artifacts: RuntimeDiffArtifact[];
  approvals: ApprovalRequest[];
};

export async function createCommandTask(input: CreateTaskInput): Promise<CommandTask> {
  hydrate();
  const now = Date.now();
  const task: CommandTask = {
    id: id("task"),
    goal: input.prompt.trim(),
    status: "queued",
    createdAt: now,
    updatedAt: now,
    runtimeId: "mock-runtime",
  };
  tasks.set(task.id, task);
  events.set(task.id, []);
  persist();

  void runTask(task, input.workspacePath);

  return task;
}

export function getCommandTask(taskId: string): CommandTaskSnapshot | null {
  hydrate();
  const task = tasks.get(taskId);
  if (!task) {
    return null;
  }

  return {
    ...task,
    events: events.get(task.id) ?? [],
    artifact: task.artifactId ? artifacts.get(task.artifactId) : undefined,
    approval: task.approvalId ? approvals.get(task.approvalId) : undefined,
  };
}

export function getArtifact(artifactId: string): RuntimeDiffArtifact | null {
  hydrate();
  return artifacts.get(artifactId) ?? null;
}

export function decideApproval(
  approvalId: string,
  decision: "approved" | "rejected" | "changes_requested",
  feedback?: string,
): ApprovalRequest | null {
  hydrate();
  const approval = approvals.get(approvalId);
  if (!approval) {
    return null;
  }

  const updated: ApprovalRequest = {
    ...approval,
    decision,
    feedback,
    decidedBy: "human",
    decidedAt: Date.now(),
  };
  approvals.set(approvalId, updated);

  const task = tasks.get(approval.taskId);
  if (task) {
    task.status = decision === "approved" ? "approved" : "rejected";
    task.updatedAt = Date.now();
    tasks.set(task.id, task);
    appendEvent(task.id, {
      id: id("evt"),
      runtimeId: task.runtimeId,
      type: decision === "approved" ? "runtime.turn.completed" : "runtime.turn.failed",
      timestamp: Date.now(),
      traceId: traceId(task.id),
      taskId: task.id,
      payload: {
        approvalId,
        decision,
        feedback,
      },
    });
  }

  persist();
  return updated;
}

export function subscribeTaskEvents(taskId: string, listener: (event: RuntimeEvent) => void): () => void {
  const eventName = taskEventName(taskId);
  emitter.on(eventName, listener);
  return () => emitter.off(eventName, listener);
}

async function runTask(commandTask: CommandTask, workspacePath?: string): Promise<void> {
  const now = Date.now();
  const taskNode: TaskNode = {
    id: commandTask.id,
    description: commandTask.goal,
    agent: "developer",
    status: "assigned",
    createdAt: now,
    updatedAt: now,
  };

  const toolCallTask: ToolCallTask = {
    task: taskNode,
    goal: commandTask.goal,
    instructions: buildInstructions(commandTask.goal),
  };

  updateTask(commandTask.id, { status: "running" });

  const result = await manager.executeTurn(
    "mock-runtime",
    {
      traceId: traceId(commandTask.id),
      workspacePath: workspacePath ?? process.cwd(),
      sandboxProfile: "workspace",
    },
    toolCallTask,
    { timeoutMs: 30_000 },
  );

  for (const event of result.events) {
    appendEvent(commandTask.id, event);
  }

  artifacts.set(result.artifact.id, result.artifact);
  persist();

  if (result.status === "failed") {
    updateTask(commandTask.id, {
      status: "failed",
      artifactId: result.artifact.id,
      error: result.error,
    });
    return;
  }

  const approval: ApprovalRequest = {
    id: id("approval"),
    taskId: commandTask.id,
    artifactId: result.artifact.id,
    summary: "Runtime produced a patch artifact. Human approval is required before apply.",
    diff: result.artifact.data.patch,
    requestedAt: Date.now(),
  };
  approvals.set(approval.id, approval);

  updateTask(commandTask.id, {
    status: "awaiting_approval",
    artifactId: result.artifact.id,
    approvalId: approval.id,
    error: result.error,
  });

  appendEvent(commandTask.id, {
    id: id("evt"),
    runtimeId: commandTask.runtimeId,
    type: "runtime.partial",
    timestamp: Date.now(),
    traceId: traceId(commandTask.id),
    taskId: commandTask.id,
    payload: {
      approvalId: approval.id,
      artifactId: result.artifact.id,
      status: result.status,
    },
  });
}

function updateTask(taskId: string, patch: Partial<CommandTask>): void {
  const task = tasks.get(taskId);
  if (!task) {
    return;
  }

  tasks.set(taskId, {
    ...task,
    ...patch,
    updatedAt: Date.now(),
  });
  persist();
}

function appendEvent(taskId: string, event: RuntimeEvent): void {
  const taskEvents = events.get(taskId) ?? [];
  taskEvents.push(event);
  events.set(taskId, taskEvents);
  persist();
  emitter.emit(taskEventName(taskId), event);
}

function hydrate(): void {
  if (!existsSync(statePath)) {
    return;
  }

  const raw = readFileSync(statePath, "utf8");
  if (!raw.trim()) {
    return;
  }

  const state = JSON.parse(raw) as PersistedState;
  tasks.clear();
  events.clear();
  artifacts.clear();
  approvals.clear();

  for (const task of state.tasks ?? []) {
    tasks.set(task.id, task);
  }
  for (const [taskId, taskEvents] of state.events ?? []) {
    events.set(taskId, taskEvents);
  }
  for (const artifact of state.artifacts ?? []) {
    artifacts.set(artifact.id, artifact);
  }
  for (const approval of state.approvals ?? []) {
    approvals.set(approval.id, approval);
  }
}

function persist(): void {
  const state: PersistedState = {
    tasks: [...tasks.values()],
    events: [...events.entries()],
    artifacts: [...artifacts.values()],
    approvals: [...approvals.values()],
  };

  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function buildInstructions(goal: string): string {
  return [
    "You are the first executable runtime behind AI Engineering OS.",
    "Do not mutate the main workspace.",
    "Produce a proposed patch artifact and emit auditable runtime/tool events.",
    `User goal: ${goal}`,
  ].join("\n");
}

function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function traceId(taskId: string): string {
  return `trace_${taskId}`;
}

function taskEventName(taskId: string): string {
  return `task:${taskId}`;
}
