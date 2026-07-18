import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type GitSandboxResult = {
  workspacePath: string;
  sandboxPath: string;
  diff: string;
  diffCommand: string;
  changedFile: string;
};

export function createGitSandboxPatch(workspacePath: string, taskId: string, goal: string): GitSandboxResult | null {
  if (!existsSync(workspacePath)) {
    return null;
  }

  const repoRoot = tryGit(workspacePath, ["rev-parse", "--show-toplevel"])?.trim();
  if (!repoRoot) {
    return null;
  }

  const sandboxRoot = resolve(process.cwd(), ".aieos", "git-sandboxes");
  const sandboxPath = resolve(sandboxRoot, safeName(taskId));
  rmSync(sandboxPath, { recursive: true, force: true });
  mkdirSync(sandboxRoot, { recursive: true });

  try {
    execFileSync("git", ["-C", repoRoot, "worktree", "add", "--detach", sandboxPath, "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    return null;
  }

  const changedFile = "AI_ENGINEERING_OS_TASKS.md";
  const targetPath = resolve(sandboxPath, changedFile);
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, buildTaskProposal(taskId, goal));
  tryGit(sandboxPath, ["add", "-N", changedFile]);

  const diffCommand = "git diff --unified=3";
  const diff = tryGit(sandboxPath, ["diff", "--unified=3"]) ?? "";

  return {
    workspacePath: repoRoot,
    sandboxPath,
    diff,
    diffCommand,
    changedFile,
  };
}

function buildTaskProposal(taskId: string, goal: string): string {
  return [
    "# AI Engineering OS Task Proposal",
    "",
    `Task: ${taskId}`,
    "",
    "## Goal",
    "",
    goal,
    "",
    "## Safety",
    "",
    "- Generated inside an isolated git worktree.",
    "- Main workspace is not mutated before human approval.",
    "- Diff is extracted with git diff --unified=3.",
    "",
  ].join("\n");
}

function tryGit(cwd: string, args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

function safeName(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]/g, "_");
}
