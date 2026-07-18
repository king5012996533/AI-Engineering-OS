// Grok Build Headless Bridge — Diff Extraction
//
// Runs `git diff --unified=3` in the worktree where Grok executed, captures
// the patch, and returns it as a RuntimeDiffArtifact. Falls back gracefully
// when git is unavailable or the diff is empty.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RuntimeDiffArtifact, RuntimeDiffStatus } from "@aieos/protocol";

const execFileAsync = promisify(execFile);

const now = () => Date.now();
const id = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

export type DiffExtractionInput = {
  worktreePath: string;
  taskId: string;
  runtimeId: string;
  /** Optional notes to attach when the diff is partial/failed. */
  notes?: string;
  /** Force a status override (e.g. "partial" after timeout). */
  forceStatus?: RuntimeDiffStatus;
};

export type DiffExtractionResult = {
  patch: string;
  status: RuntimeDiffStatus;
  diffCommand: string;
  notes?: string;
  gitError?: string;
};

const DIFF_COMMAND = "git diff --unified=3 --no-color";

/**
 * Run `git diff` in the worktree and return the unified patch.
 *
 * Uses `--no-color` so the patch is machine-parseable, and does not pass
 * `--cached` so we capture both staged and unstaged changes Grok made.
 * Untracked files are intentionally excluded by `git diff` — Grok's
 * search_replace tool edits existing files, so this is the right scope
 * for the first bridge. A follow-up can add `git add -N` for new files.
 */
export async function extractWorktreeDiff(input: DiffExtractionInput): Promise<DiffExtractionResult> {
  const { worktreePath } = input;

  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", worktreePath, "diff", "--unified=3", "--no-color"],
      {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      },
    );

    const patch = stdout ?? "";
    let status: RuntimeDiffStatus = patch.trim() ? "proposed" : "empty";

    if (input.forceStatus) {
      status = input.forceStatus;
    }

    return {
      patch,
      status,
      diffCommand: DIFF_COMMAND,
      notes: input.notes,
    };
  } catch (error) {
    const gitError = error instanceof Error ? error.message : String(error);
    return {
      patch: "",
      status: input.forceStatus ?? "failed",
      diffCommand: DIFF_COMMAND,
      notes: input.notes ?? `git diff failed: ${gitError}`,
      gitError,
    };
  }
}

/**
 * Build a RuntimeDiffArtifact from a diff extraction result.
 */
export function buildDiffArtifact(
  input: DiffExtractionInput,
  result: DiffExtractionResult,
): RuntimeDiffArtifact {
  const status = result.forceStatus ?? result.status;
  const isPartial = status === "partial" || status === "failed";

  return {
    id: id("art"),
    type: "patch",
    taskId: input.taskId,
    agentId: "developer.grok-build",
    label: isPartial ? "Grok Build partial patch" : "Grok Build patch proposal",
    source: input.runtimeId,
    lifecycleState: "created",
    approvalState: "not_required",
    data: {
      patch: result.patch,
      status,
      diffCommand: result.diffCommand,
      notes: result.notes,
      workspacePath: input.worktreePath,
      sandboxPath: input.worktreePath,
    },
    version: 1,
    createdAt: now(),
  };
}

/**
 * Convenience: extract diff and build artifact in one call.
 */
export async function extractDiffArtifact(input: DiffExtractionInput): Promise<RuntimeDiffArtifact> {
  const result = await extractWorktreeDiff(input);
  return buildDiffArtifact(input, result);
}
