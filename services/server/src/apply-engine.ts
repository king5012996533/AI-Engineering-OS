import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeDiffArtifact } from "@aieos/protocol";

export type ApplyResult = {
  applied: boolean;
  workspacePath: string;
  appliedAt: number;
  output?: string;
  error?: string;
};

export function applyPatchArtifact(artifact: RuntimeDiffArtifact, workspacePath?: string): ApplyResult {
  const targetWorkspace = workspacePath ?? artifact.data.workspacePath;
  const patch = artifact.data.patch;
  const appliedAt = Date.now();

  if (!targetWorkspace) {
    return { applied: false, workspacePath: "", appliedAt, error: "Artifact has no workspacePath." };
  }

  if (!patch.trim()) {
    return { applied: false, workspacePath: targetWorkspace, appliedAt, error: "Artifact patch is empty." };
  }

  const repoRoot = tryGit(targetWorkspace, ["rev-parse", "--show-toplevel"])?.trim();
  if (!repoRoot) {
    return { applied: false, workspacePath: targetWorkspace, appliedAt, error: "Workspace is not a git repository." };
  }

  const tempDir = mkdtempSync(join(tmpdir(), "aieos-patch-"));
  const patchPath = join(tempDir, "artifact.patch");
  writeFileSync(patchPath, patch);

  try {
    execFileSync("git", ["-C", repoRoot, "apply", "--check", patchPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const output = execFileSync("git", ["-C", repoRoot, "apply", patchPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    return {
      applied: true,
      workspacePath: repoRoot,
      appliedAt,
      output: output.trim() || "Patch applied.",
    };
  } catch (error) {
    return {
      applied: false,
      workspacePath: repoRoot,
      appliedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
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
