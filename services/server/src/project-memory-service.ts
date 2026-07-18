import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ProjectDecision, ProjectMemory } from "@aieos/protocol";

type MemoryState = {
  projects: ProjectMemory[];
};

const statePath = resolve(process.cwd(), ".aieos", "project-memory.json");
const projects = new Map<string, ProjectMemory>();

export function getProjectMemory(workspacePath?: string): ProjectMemory {
  hydrateMemory();
  const projectId = projectMemoryId(workspacePath);
  const existing = projects.get(projectId);
  if (existing) {
    return existing;
  }

  const project: ProjectMemory = {
    id: projectId,
    name: workspacePath ? lastPathSegment(workspacePath) : "Default Project",
    workspacePath,
    goals: [],
    decisions: [],
    artifactIds: [],
    taskIds: [],
    reviews: [],
    history: [],
    updatedAt: Date.now(),
  };
  projects.set(project.id, project);
  persistMemory();
  return project;
}

export function rememberTask(workspacePath: string | undefined, taskId: string, goal: string): ProjectMemory {
  const project = getProjectMemory(workspacePath);
  return saveProjectMemory({
    ...project,
    goals: unique([goal, ...project.goals]).slice(0, 20),
    taskIds: unique([taskId, ...project.taskIds]).slice(0, 100),
    history: [`Task ${taskId}: ${goal}`, ...project.history].slice(0, 100),
    updatedAt: Date.now(),
  });
}

export function rememberArtifact(workspacePath: string | undefined, artifactId: string): ProjectMemory {
  const project = getProjectMemory(workspacePath);
  return saveProjectMemory({
    ...project,
    artifactIds: unique([artifactId, ...project.artifactIds]).slice(0, 100),
    updatedAt: Date.now(),
  });
}

export function rememberDecision(
  workspacePath: string | undefined,
  input: Omit<ProjectDecision, "id" | "createdAt">,
): ProjectMemory {
  const project = getProjectMemory(workspacePath);
  const decision: ProjectDecision = {
    id: `decision_${Math.random().toString(36).slice(2, 10)}`,
    createdAt: Date.now(),
    ...input,
  };

  return saveProjectMemory({
    ...project,
    decisions: [decision, ...project.decisions].slice(0, 50),
    updatedAt: Date.now(),
  });
}

function saveProjectMemory(project: ProjectMemory): ProjectMemory {
  projects.set(project.id, project);
  persistMemory();
  return project;
}

function hydrateMemory(): void {
  if (!existsSync(statePath)) {
    return;
  }

  const raw = readFileSync(statePath, "utf8");
  if (!raw.trim()) {
    return;
  }

  const state = JSON.parse(raw) as MemoryState;
  projects.clear();
  for (const project of state.projects ?? []) {
    projects.set(project.id, project);
  }
}

function persistMemory(): void {
  const state: MemoryState = {
    projects: [...projects.values()],
  };
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function projectMemoryId(workspacePath?: string): string {
  if (!workspacePath) {
    return "project_default";
  }
  return `project_${Buffer.from(workspacePath.toLowerCase()).toString("base64url").slice(0, 32)}`;
}

function lastPathSegment(path: string): string {
  return path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "Project";
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

