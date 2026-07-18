import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type {
  ApprovalRequest,
  ApplyAuditRecord,
  ProjectMemory,
  RuntimeCapabilities,
  RunRecord,
  RuntimeDiffArtifact,
  RuntimeEvent,
  TaskNode,
  ToolCallTask,
} from "@aieos/protocol";
import { evaluateApprovalPolicy } from "./approval-policy-service.js";
import { applyPatchArtifact } from "./apply-engine.js";
import { createGitSandboxPatch } from "./git-sandbox-service.js";
import {
  getProjectMemory,
  rememberAppliedArtifact,
  rememberArtifact,
  rememberDecision,
  rememberTask,
} from "./project-memory-service.js";
import { RuntimeManager } from "./runtime-manager.js";
import { MockRuntime } from "./runtimes/mock-runtime.js";

export type CommandTaskStatus =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "approved"
  | "applied"
  | "rejected"
  | "failed";

export type CommandTask = {
  id: string;
  goal: string;
  status: CommandTaskStatus;
  createdAt: number;
  updatedAt: number;
  runtimeId: string;
  workspacePath?: string;
  projectId?: string;
  runId?: string;
  artifactId?: string;
  approvalId?: string;
  error?: string;
};

export type CommandTaskSnapshot = CommandTask & {
  events: RuntimeEvent[];
  artifact?: RuntimeDiffArtifact;
  approval?: ApprovalRequest;
  run?: RunRecord;
  applyAudit?: ApplyAuditRecord;
  projectMemory?: ProjectMemory;
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
const runs = new Map<string, RunRecord>();
const applyAudits = new Map<string, ApplyAuditRecord>();
const emitter = new EventEmitter();
const statePath = resolve(process.cwd(), ".aieos", "command-center.json");

type PersistedState = {
  tasks: CommandTask[];
  events: Array<[string, RuntimeEvent[]]>;
  artifacts: RuntimeDiffArtifact[];
  approvals: ApprovalRequest[];
  runs: RunRecord[];
  applyAudits: ApplyAuditRecord[];
};

export function listRuntimeProviders(): RuntimeCapabilities[] {
  return manager.listCapabilities();
}

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
    workspacePath: input.workspacePath,
    projectId: getProjectMemory(input.workspacePath).id,
  };
  const run: RunRecord = {
    id: id("run"),
    taskId: task.id,
    runtimeId: task.runtimeId,
    workspacePath: input.workspacePath,
    status: "queued",
    startedAt: now,
  };
  task.runId = run.id;
  tasks.set(task.id, task);
  runs.set(run.id, run);
  events.set(task.id, []);
  rememberTask(input.workspacePath, task.id, task.goal);
  rememberDecision(input.workspacePath, {
    title: "Human Intent Captured",
    summary: task.goal,
    sourceTaskId: task.id,
  });
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
    run: task.runId ? runs.get(task.runId) : undefined,
    applyAudit: task.artifactId ? latestApplyAudit(task.artifactId) : undefined,
    projectMemory: getProjectMemory(task.workspacePath),
  };
}

export function getArtifact(artifactId: string): RuntimeDiffArtifact | null {
  hydrate();
  return artifacts.get(artifactId) ?? null;
}

export function applyArtifact(artifactId: string): RuntimeDiffArtifact | null {
  hydrate();
  const artifact = artifacts.get(artifactId);
  if (!artifact) {
    return null;
  }

  const task = tasks.get(artifact.taskId);
  if (!task) {
    return null;
  }

  if (artifact.approvalState !== "approved") {
    throw new Error("Artifact must be approved before apply.");
  }

  if (artifact.lifecycleState === "applied" || artifact.lifecycleState === "archived") {
    return artifact;
  }

  const result = applyPatchArtifact(artifact, task.workspacePath);
  const approval = task.approvalId ? approvals.get(task.approvalId) : undefined;
  const audit: ApplyAuditRecord = {
    id: id("apply"),
    taskId: task.id,
    artifactId: artifact.id,
    approvalId: approval?.id,
    approvedBy: approval?.decidedBy,
    appliedBy: "apply-engine",
    workspacePath: result.workspacePath,
    beforeCommit: result.beforeCommit,
    afterCommit: result.afterCommit,
    status: result.applied ? "applied" : "failed",
    appliedAt: result.appliedAt,
    error: result.error,
  };
  applyAudits.set(audit.id, audit);

  if (!result.applied) {
    appendEvent(task.id, {
      id: id("evt"),
      runtimeId: task.runtimeId,
      type: "runtime.turn.failed",
      timestamp: Date.now(),
      traceId: traceId(task.id),
      taskId: task.id,
      payload: {
        artifactId,
        applyError: result.error,
      },
    });
    persist();
    throw new Error(result.error ?? "Apply failed.");
  }

  const applied: RuntimeDiffArtifact = {
    ...artifact,
    lifecycleState: "applied",
    data: {
      ...artifact.data,
      workspacePath: result.workspacePath,
      appliedAt: result.appliedAt,
      beforeCommit: result.beforeCommit,
      afterCommit: result.afterCommit,
      notes: result.output ?? artifact.data.notes,
    },
  };
  artifacts.set(applied.id, applied);
  updateTask(task.id, { status: "applied" });

  const run = task.runId ? runs.get(task.runId) : undefined;
  if (run) {
    runs.set(run.id, {
      ...run,
      status: "applied",
      appliedAt: result.appliedAt,
      completedAt: run.completedAt ?? result.appliedAt,
      artifactId: artifact.id,
    });
  }

  rememberAppliedArtifact(task.workspacePath, artifact.id, task.id);
  rememberDecision(task.workspacePath, {
    title: "Artifact Applied",
    summary: `Applied ${artifact.label} to ${result.workspacePath}`,
    sourceTaskId: task.id,
  });
  appendEvent(task.id, {
    id: id("evt"),
    runtimeId: task.runtimeId,
    type: "artifact.applied",
    timestamp: result.appliedAt,
    traceId: traceId(task.id),
    taskId: task.id,
    payload: {
      artifactId,
      workspacePath: result.workspacePath,
      applyAuditId: audit.id,
      beforeCommit: result.beforeCommit,
      afterCommit: result.afterCommit,
    },
  });

  persist();
  return applied;
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
    transitionArtifact(approval.artifactId, decision);
    appendEvent(task.id, {
      id: id("evt"),
      runtimeId: task.runtimeId,
      type: decision === "approved" ? "artifact.approved" : "runtime.partial",
      timestamp: Date.now(),
      traceId: traceId(task.id),
      taskId: task.id,
      payload: {
        approvalId,
        artifactId: approval.artifactId,
        decision,
      },
    });
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
  updateRun(commandTask.runId, { status: "running" });
  appendEvent(commandTask.id, {
    id: id("evt"),
    runtimeId: commandTask.runtimeId,
    type: "run.created",
    timestamp: Date.now(),
    traceId: traceId(commandTask.id),
    taskId: commandTask.id,
    payload: {
      runId: commandTask.runId,
      workspacePath,
    },
  });

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

  const artifact = buildArtifact(commandTask, result.artifact);
  const policy = evaluateApprovalPolicy(artifact);
  const governedArtifact: RuntimeDiffArtifact = {
    ...artifact,
    risk: policy.riskLevel,
    lifecycleState: policy.requiresHuman ? "review_required" : "approved",
    approvalState: policy.requiresHuman ? "pending" : "approved",
  };
  artifacts.set(governedArtifact.id, governedArtifact);
  updateRun(commandTask.runId, {
    status: result.status === "completed" ? "completed" : result.status,
    completedAt: Date.now(),
    artifactId: governedArtifact.id,
    error: result.error,
    sandboxPath: governedArtifact.data.sandboxPath,
  });
  rememberArtifact(commandTask.workspacePath, governedArtifact.id);
  persist();

  if (result.status === "failed") {
    updateTask(commandTask.id, {
      status: "failed",
      artifactId: governedArtifact.id,
      error: result.error,
    });
    return;
  }

  const approval: ApprovalRequest = {
    id: id("approval"),
    taskId: commandTask.id,
    artifactId: governedArtifact.id,
    summary: policy.requiresHuman
      ? "Runtime produced a patch artifact. Human approval is required before apply."
      : "Approval policy auto-approved this low-risk artifact.",
    policyId: policy.id,
    riskLevel: policy.riskLevel,
    requiresHuman: policy.requiresHuman,
    reason: policy.reason,
    diff: governedArtifact.data.patch,
    requestedAt: Date.now(),
    decision: policy.requiresHuman ? undefined : "approved",
    decidedBy: policy.requiresHuman ? undefined : "policy",
    decidedAt: policy.requiresHuman ? undefined : Date.now(),
  };
  approvals.set(approval.id, approval);

  updateTask(commandTask.id, {
    status: policy.requiresHuman ? "awaiting_approval" : "approved",
    artifactId: governedArtifact.id,
    approvalId: approval.id,
    error: result.error,
  });
  appendEvent(commandTask.id, {
    id: id("evt"),
    runtimeId: commandTask.runtimeId,
    type: "run.completed",
    timestamp: Date.now(),
    traceId: traceId(commandTask.id),
    taskId: commandTask.id,
    payload: {
      runId: commandTask.runId,
      artifactId: governedArtifact.id,
      status: result.status,
    },
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
      artifactId: governedArtifact.id,
      status: result.status,
      policyId: policy.id,
      riskLevel: policy.riskLevel,
      requiresHuman: policy.requiresHuman,
      reason: policy.reason,
    },
  });
}

function buildArtifact(commandTask: CommandTask, fallback: RuntimeDiffArtifact): RuntimeDiffArtifact {
  if (!commandTask.workspacePath) {
    return fallback;
  }

  const sandbox = createGitSandboxPatch(commandTask.workspacePath, commandTask.id, commandTask.goal);
  if (!sandbox?.diff) {
    appendEvent(commandTask.id, {
      id: id("evt"),
      runtimeId: commandTask.runtimeId,
      type: "runtime.text",
      timestamp: Date.now(),
      traceId: traceId(commandTask.id),
      taskId: commandTask.id,
      payload: {
        text: "Git sandbox was not available; using runtime fallback artifact.",
      },
    });
    return attachWorkspaceToFallback(fallback, commandTask.workspacePath);
  }

  appendEvent(commandTask.id, {
    id: id("evt"),
    runtimeId: commandTask.runtimeId,
    type: "runtime.diff.extracted",
    timestamp: Date.now(),
    traceId: traceId(commandTask.id),
    taskId: commandTask.id,
    payload: {
      workspacePath: sandbox.workspacePath,
      sandboxPath: sandbox.sandboxPath,
      changedFile: sandbox.changedFile,
      diffCommand: sandbox.diffCommand,
    },
  });

  return {
    ...fallback,
    id: id("art"),
    label: "Git sandbox patch proposal",
    source: "git-sandbox",
    lifecycleState: "created",
    approvalState: "not_required",
    data: {
      patch: sandbox.diff,
      status: "proposed",
      diffCommand: sandbox.diffCommand,
      workspacePath: sandbox.workspacePath,
      sandboxPath: sandbox.sandboxPath,
      changedFile: sandbox.changedFile,
      notes: `Generated in isolated worktree: ${sandbox.sandboxPath}`,
    },
  };
}

function attachWorkspaceToFallback(
  fallback: RuntimeDiffArtifact,
  workspacePath: string,
): RuntimeDiffArtifact {
  return {
    ...fallback,
    data: {
      ...fallback.data,
      workspacePath,
    },
  };
}

function transitionArtifact(
  artifactId: string,
  decision: "approved" | "rejected" | "changes_requested",
): void {
  const artifact = artifacts.get(artifactId);
  if (!artifact) {
    return;
  }

  artifacts.set(artifactId, {
    ...artifact,
    lifecycleState: decision === "approved" ? "approved" : "rejected",
    approvalState: decision,
  });
}

function updateRun(runId: string | undefined, patch: Partial<RunRecord>): void {
  if (!runId) {
    return;
  }
  const run = runs.get(runId);
  if (!run) {
    return;
  }
  runs.set(runId, {
    ...run,
    ...patch,
  });
  persist();
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
  runs.clear();
  applyAudits.clear();

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
  for (const run of state.runs ?? []) {
    runs.set(run.id, run);
  }
  for (const applyAudit of state.applyAudits ?? []) {
    applyAudits.set(applyAudit.id, applyAudit);
  }
}

function persist(): void {
  const state: PersistedState = {
    tasks: [...tasks.values()],
    events: [...events.entries()],
    artifacts: [...artifacts.values()],
    approvals: [...approvals.values()],
    runs: [...runs.values()],
    applyAudits: [...applyAudits.values()],
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

function latestApplyAudit(artifactId: string): ApplyAuditRecord | undefined {
  return [...applyAudits.values()]
    .filter((audit) => audit.artifactId === artifactId)
    .sort((a, b) => b.appliedAt - a.appliedAt)[0];
}
