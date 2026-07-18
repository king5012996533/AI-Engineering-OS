"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type RuntimeEvent = {
  id: string;
  type: string;
  timestamp: number;
  payload?: unknown;
};

type TaskSnapshot = {
  id: string;
  goal: string;
  status: string;
  runtimeId: string;
  workspacePath?: string;
  projectId?: string;
  artifactId?: string;
  approvalId?: string;
  error?: string;
  events: RuntimeEvent[];
  artifact?: {
    id: string;
    label: string;
    data: {
      patch: string;
      status: string;
      diffCommand: string;
      notes?: string;
    };
  };
  approval?: {
    id: string;
    summary: string;
    decision?: string;
  };
  projectMemory?: {
    id: string;
    name: string;
    workspacePath?: string;
    goals: string[];
    decisions: Array<{
      id: string;
      title: string;
      summary: string;
      sourceTaskId?: string;
      createdAt: number;
    }>;
    artifactIds: string[];
    taskIds: string[];
    history: string[];
  };
};

const suggestions = [
  "Add password login to this project",
  "Review the architecture and propose the first implementation task",
  "Create a payment module plan with approval checkpoints",
];

export default function CommandCenterPage() {
  const [prompt, setPrompt] = useState("Add login with human approval before applying code changes");
  const [workspacePath, setWorkspacePath] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [task, setTask] = useState<TaskSnapshot | null>(null);
  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!taskId) {
      return;
    }

    const source = new EventSource(`/api/tasks/${taskId}/events`);
    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as RuntimeEvent;
      setEvents((current) => (current.some((item) => item.id === event.id) ? current : [...current, event]));
      void refreshTask(taskId);
    };

    const interval = setInterval(() => void refreshTask(taskId), 1000);

    return () => {
      source.close();
      clearInterval(interval);
    };
  }, [taskId]);

  const visibleEvents = useMemo(() => {
    const initial = task?.events ?? [];
    const merged = [...initial, ...events];
    return merged.filter((event, index) => merged.findIndex((item) => item.id === event.id) === index);
  }, [events, task?.events]);

  async function refreshTask(id: string) {
    const response = await fetch(`/api/tasks/${id}`);
    if (!response.ok) {
      return;
    }
    const snapshot = (await response.json()) as TaskSnapshot;
    setTask(snapshot);
  }

  async function createTask(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setEvents([]);
    setTask(null);

    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        workspacePath: workspacePath.trim() || undefined,
      }),
    });

    const created = (await response.json()) as TaskSnapshot;
    setTaskId(created.id);
    await refreshTask(created.id);
    setLoading(false);
  }

  async function decide(decision: "approved" | "rejected") {
    if (!task?.approvalId) {
      return;
    }

    await fetch(`/api/approvals/${task.approvalId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    await refreshTask(task.id);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Protocol-Driven Software Engineering</p>
          <h1>AI Engineering OS</h1>
        </div>
        <div className="runtime-pill">Runtime: {task?.runtimeId ?? "mock-runtime"}</div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">Command Center MVP</p>
          <h2>Talk like ChatGPT. Execute like an engineering team.</h2>
        </div>
        <p>
          This first build turns your protocol into a visible workflow: user intent, task timeline, runtime events,
          patch artifact, and human approval.
        </p>
      </section>

      <section className="grid">
        <form className="panel conversation" onSubmit={createTask}>
          <div className="panel-title">
            <span>01</span>
            <h3>Conversation</h3>
          </div>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          <input
            value={workspacePath}
            onChange={(event) => setWorkspacePath(event.target.value)}
            placeholder="Optional workspace path"
          />
          <div className="suggestions">
            {suggestions.map((item) => (
              <button key={item} type="button" onClick={() => setPrompt(item)}>
                {item}
              </button>
            ))}
          </div>
          <button className="primary" type="submit" disabled={loading || !prompt.trim()}>
            {loading ? "Creating task..." : "Create Task"}
          </button>
        </form>

        <section className="panel workspace">
          <div className="panel-title">
            <span>02</span>
            <h3>Project Workspace</h3>
          </div>
          <dl>
            <div>
              <dt>Goal</dt>
              <dd>{task?.goal ?? "No active task yet"}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{task?.status ?? "idle"}</dd>
            </div>
            <div>
              <dt>Artifact</dt>
              <dd>{task?.artifactId ?? "waiting for runtime output"}</dd>
            </div>
            <div>
              <dt>Approval</dt>
              <dd>{task?.approval?.decision ?? (task?.approvalId ? "waiting human decision" : "not requested")}</dd>
            </div>
          </dl>
        </section>

        <section className="panel timeline">
          <div className="panel-title">
            <span>03</span>
            <h3>Task Timeline</h3>
          </div>
          <ol>
            {["Understand requirement", "Create task graph", "Run controlled runtime", "Generate patch artifact", "Wait for approval"].map(
              (step, index) => (
                <li key={step} className={index < timelineProgress(task?.status) ? "done" : "pending"}>
                  <span>{index < timelineProgress(task?.status) ? "✓" : "○"}</span>
                  {step}
                </li>
              ),
            )}
          </ol>
        </section>

        <section className="panel memory">
          <div className="panel-title">
            <span>04</span>
            <h3>Project Memory</h3>
          </div>
          {task?.projectMemory ? (
            <div className="memory-grid">
              <div>
                <p className="memory-label">Project</p>
                <strong>{task.projectMemory.name}</strong>
                <small>{task.projectMemory.workspacePath ?? "Default memory"}</small>
              </div>
              <div>
                <p className="memory-label">Goals</p>
                <strong>{task.projectMemory.goals.length}</strong>
                <small>{task.projectMemory.goals[0] ?? "No goals stored yet"}</small>
              </div>
              <div>
                <p className="memory-label">Decisions</p>
                <strong>{task.projectMemory.decisions.length}</strong>
                <small>{task.projectMemory.decisions[0]?.summary ?? "No decisions stored yet"}</small>
              </div>
              <div>
                <p className="memory-label">Artifacts</p>
                <strong>{task.projectMemory.artifactIds.length}</strong>
                <small>{task.projectMemory.artifactIds[0] ?? "No artifacts stored yet"}</small>
              </div>
            </div>
          ) : (
            <p className="muted">Project memory will appear after the first task is created.</p>
          )}
        </section>

        <section className="panel events">
          <div className="panel-title">
            <span>05</span>
            <h3>Runtime Events</h3>
          </div>
          <div className="event-list">
            {visibleEvents.length === 0 ? (
              <p className="muted">No events yet.</p>
            ) : (
              visibleEvents.map((event) => (
                <div key={event.id} className="event-row">
                  <time>{new Date(event.timestamp).toLocaleTimeString()}</time>
                  <strong>{event.type}</strong>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="panel artifact">
          <div className="panel-title">
            <span>06</span>
            <h3>Artifact / Diff</h3>
          </div>
          <pre>{task?.artifact?.data.patch || "Patch artifact will appear here."}</pre>
          <div className="approval-bar">
            <p>{task?.approval?.summary ?? "No approval request yet."}</p>
            <div>
              <button disabled={!task?.approvalId || Boolean(task?.approval?.decision)} onClick={() => decide("rejected")}>
                Reject
              </button>
              <button
                className="primary"
                disabled={!task?.approvalId || Boolean(task?.approval?.decision)}
                onClick={() => decide("approved")}
              >
                Approve
              </button>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

function timelineProgress(status?: string): number {
  switch (status) {
    case "queued":
      return 1;
    case "running":
      return 3;
    case "awaiting_approval":
      return 5;
    case "approved":
    case "rejected":
      return 5;
    case "failed":
      return 4;
    default:
      return 0;
  }
}
