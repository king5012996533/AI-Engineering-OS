// Grok Build Headless Bridge — Adapter
//
// Implements the AgentRuntime interface by spawning `grok -p` as a child
// process in an isolated git worktree, streaming its events into RuntimeEvent,
// and extracting the final diff as an Artifact.
//
// This is the Stage 1 bridge: minimal, no Grok source modification, no ACP.
// Stage 2 will replace the process spawn with `grok agent stdio` (ACP).

import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import type {
  AgentRuntime,
  RuntimeCapabilities,
  RuntimeContext,
  RuntimeDiffArtifact,
  RuntimeEvent,
  RuntimeKind,
  ToolCallTask,
} from "@aieos/protocol";
import { buildGrokCommand } from "./command.js";
import { mapGrokEvent, parseStreamingLine } from "./event-mapper.js";
import { extractDiffArtifact } from "./diff.js";

const execFileAsync = promisify(execFile);

const now = () => Date.now();
const id = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

export type GrokBuildHeadlessOptions = {
  /** Override the grok binary path. Defaults to `grok` on PATH. */
  binary?: string;
  /** Override the model id. Defaults to `grok-build`. */
  model?: string;
  /** Max agentic turns. */
  maxTurns?: number;
  /** Reasoning effort. */
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  /** Extra deny rules beyond the built-in defaults. */
  denyRules?: string[];
  /** Extra rules appended to the system prompt. */
  rules?: string;
  /** Skip worktree creation and run in workspacePath directly. UNSAFE for writes. */
  skipWorktree?: boolean;
};

type WorktreeHandle = {
  path: string;
  isolated: boolean;
  /** Remove the worktree. Safe to call multiple times. */
  cleanup: () => Promise<void>;
};

/**
 * Async iterator that yields complete lines from a Node Readable stream.
 *
 * Buffers partial lines across `data` chunks and flushes the trailing
 * partial on `end`. Yields `null` when the stream closes.
 */
async function* linesFrom(stream: NodeJS.ReadableStream): AsyncIterable<string> {
  let buffer = "";
  let resolveNext: ((value: string | null) => void) | null = null;
  const queue: Array<string | null> = [];

  const enqueue = (item: string | null) => {
    if (resolveNext) {
      const resolve = resolveNext;
      resolveNext = null;
      resolve(item);
    } else {
      queue.push(item);
    }
  };

  stream.on("data", (chunk: Buffer | string) => {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    buffer += text;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      enqueue(line);
    }
  });
  stream.on("end", () => {
    if (buffer.length > 0) {
      enqueue(buffer);
      buffer = "";
    }
    enqueue(null);
  });
  stream.on("error", (err) => {
    enqueue(`__stream_error__${err.message}`);
  });

  while (true) {
    if (queue.length > 0) {
      const item = queue.shift();
      if (item === null) {
        return;
      }
      yield item;
      continue;
    }
    const item = await new Promise<string | null>((resolve) => {
      resolveNext = resolve;
    });
    if (item === null) {
      return;
    }
    yield item;
  }
}

export class GrokBuildHeadlessRuntime implements AgentRuntime {
  readonly id = "grok-build-headless";
  readonly kind: RuntimeKind = "grok-build";

  private readonly options: GrokBuildHeadlessOptions;

  private context: RuntimeContext | null = null;
  private worktree: WorktreeHandle | null = null;
  private task: ToolCallTask | null = null;
  /** Captured sessionId from the `end` event, for resume support later. */
  private sessionId: string | null = null;
  /** True if the last run ended in error or max_turns. */
  private partial = false;
  private partialNotes: string | null = null;

  constructor(options: GrokBuildHeadlessOptions = {}) {
    this.options = options;
  }

  capabilities(): RuntimeCapabilities {
    return {
      id: this.id,
      kind: this.kind,
      displayName: "Grok Build (Headless)",
      capabilities: [
        "tool_calling",
        "streaming_events",
        "diff_extraction",
        "sandbox_required",
        "partial_diff_recovery",
      ],
      description:
        "Stage 1 bridge: spawns `grok -p --output-format streaming-json` in an isolated git worktree. Captures streaming events and extracts git diff as artifact.",
    };
  }

  async initialize(context: RuntimeContext): Promise<void> {
    this.context = context;
    this.task = null;
    this.sessionId = null;
    this.partial = false;
    this.partialNotes = null;

    // If the caller pre-created a worktree and passed its path in metadata,
    // use it directly. Otherwise create one ourselves.
    const precreated = context.metadata?.worktreePath;
    if (typeof precreated === "string" && precreated) {
      this.worktree = {
        path: precreated,
        isolated: true,
        cleanup: async () => {
          // Caller owns this worktree; we do not remove it.
        },
      };
      return;
    }

    if (this.options.skipWorktree) {
      this.worktree = {
        path: context.workspacePath,
        isolated: false,
        cleanup: async () => {},
      };
      return;
    }

    this.worktree = await createIsolatedWorktree(context.workspacePath, context.traceId);
  }

  async *executeTurn(task: ToolCallTask): AsyncIterable<RuntimeEvent> {
    if (!this.context) {
      throw new Error("GrokBuildHeadlessRuntime: initialize() must be called before executeTurn().");
    }
    if (!this.worktree) {
      throw new Error("GrokBuildHeadlessRuntime: worktree not initialized.");
    }

    this.task = task;

    const { cwd, isolated } = this.worktree;
    if (!isolated) {
      yield this.event("runtime.partial", {
        reason: "no_isolated_worktree",
        warning: "Grok will write directly to workspacePath. Approve with caution.",
      });
    }

    const command = buildGrokCommand(task, {
      cwd,
      prompt: task.instructions,
      model: this.options.model,
      maxTurns: this.options.maxTurns,
      reasoningEffort: this.options.reasoningEffort,
      denyRules: this.options.denyRules,
      rules: this.options.rules,
      binary: this.options.binary,
    });

    yield this.event("runtime.initialized", {
      workspacePath: this.context.workspacePath,
      worktreePath: cwd,
      sandboxProfile: this.context.sandboxProfile,
      isolated,
    });

    yield this.event("runtime.turn.started", {
      taskId: task.task.id,
      instructions: task.instructions,
      command: [command.binary, ...command.args].join(" "),
    });

    yield this.event("runtime.tool.requested", {
      tool: "grok-build.headless",
      reason: "Delegating the entire turn to Grok Build headless execution.",
      input: { cwd, model: this.options.model ?? "grok-build" },
    });

    yield this.event("runtime.tool.approved", {
      tool: "grok-build.headless",
      policy: "yolo + deny-rules guardrail (headless cannot prompt)",
    });

    const proc = spawn(command.binary, command.args, {
      cwd,
      env: command.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stderrChunks: string[] = [];
    proc.stderr?.setEncoding("utf8");
    proc.stderr?.on("data", (chunk: string) => {
      stderrChunks.push(chunk);
    });

    let exitCode: number | null = null;
    let exitSignal: NodeJS.Signals | null = null;
    const exitPromise = new Promise<void>((resolve) => {
      proc.once("exit", (code, signal) => {
        exitCode = code;
        exitSignal = signal;
        resolve();
      });
    });

    // Stream stdout lines.
    const stdoutLines = proc.stdout ? linesFrom(proc.stdout) : emptyAsyncIterable<string>();

    let endReached = false;
    let errorMessage: string | null = null;

    for await (const line of stdoutLines) {
      if (line.startsWith("__stream_error__")) {
        errorMessage = line.slice("__stream_error__".length);
        this.partial = true;
        this.partialNotes = errorMessage;
        break;
      }

      const parsed = parseStreamingLine(line);
      if (!parsed) {
        continue;
      }

      const mapped = mapGrokEvent(parsed, {
        runtimeId: this.id,
        traceId: this.context.traceId,
        taskId: task.task.id,
      });

      for (const item of mapped) {
        if (item.kind === "event") {
          yield item.event;
        } else if (item.kind === "end") {
          endReached = true;
          if (item.sessionId) {
            this.sessionId = item.sessionId;
          }
        } else if (item.kind === "error") {
          endReached = true;
          errorMessage = item.message;
          this.partial = true;
          this.partialNotes = item.message;
        } else if (item.kind === "max_turns") {
          endReached = true;
          this.partial = true;
          this.partialNotes = "Grok Build hit --max-turns before completing.";
        }
      }

      if (endReached) {
        break;
      }
    }

    // Ensure the process has fully exited so the worktree is quiescent
    // before we run `git diff`.
    await exitPromise;

    const stderrText = stderrChunks.join("");

    yield this.event("runtime.tool.completed", {
      tool: "grok-build.headless",
      output: {
        exitCode,
        exitSignal,
        maxTurnsReached: this.partial && this.partialNotes?.includes("max-turns") === true,
        stderrLength: stderrText.length,
        stderrTail: stderrText.slice(-512),
      },
    });

    if (errorMessage) {
      yield this.event("runtime.turn.failed", {
        message: errorMessage,
        stderrTail: stderrText.slice(-512),
      });
    } else if (this.partial) {
      yield this.event("runtime.partial", { reason: this.partialNotes ?? "unknown" });
    }

    yield this.event("runtime.diff.extracted", {
      status: this.partial ? "partial" : "proposed",
      diffCommand: "git diff --unified=3",
    });

    yield this.event("runtime.turn.completed", { taskId: task.task.id });
  }

  async extractDiff(): Promise<RuntimeDiffArtifact> {
    if (!this.worktree || !this.task) {
      throw new Error("GrokBuildHeadlessRuntime: extractDiff() called before executeTurn().");
    }

    return extractDiffArtifact({
      worktreePath: this.worktree.path,
      taskId: this.task.task.id,
      runtimeId: this.id,
      notes: this.partialNotes ?? undefined,
      forceStatus: this.partial ? "partial" : undefined,
    });
  }

  async teardown(): Promise<void> {
    if (this.worktree) {
      await this.worktree.cleanup();
      this.worktree = null;
    }
    this.context = null;
    this.task = null;
    this.sessionId = null;
  }

  private event(type: RuntimeEvent["type"], payload?: unknown): RuntimeEvent {
    if (!this.context) {
      throw new Error("GrokBuildHeadlessRuntime: context missing.");
    }
    return {
      id: id("evt"),
      runtimeId: this.id,
      type,
      timestamp: now(),
      traceId: this.context.traceId,
      taskId: this.task?.task.id,
      payload,
    };
  }
}

async function* emptyAsyncIterable<T>(): AsyncIterable<T> {
  // Intentionally empty.
}

/**
 * Create an isolated git worktree at HEAD for Grok to run in.
 *
 * Mirrors the pattern in git-sandbox-service.ts: `git worktree add --detach`.
 * The worktree is a sibling directory under `.aieos/grok-worktrees/`.
 */
async function createIsolatedWorktree(workspacePath: string, traceId: string): Promise<WorktreeHandle> {
  if (!existsSync(workspacePath)) {
    throw new Error(`GrokBuildHeadlessRuntime: workspacePath does not exist: ${workspacePath}`);
  }

  const repoRoot = await tryGitAsync(workspacePath, ["rev-parse", "--show-toplevel"]);
  if (!repoRoot) {
    throw new Error(
      `GrokBuildHeadlessRuntime: ${workspacePath} is not inside a git repository. ` +
        "An isolated worktree is required for safe headless execution. " +
        "Either initialize git, or pass skipWorktree: true (unsafe).",
    );
  }

  const sandboxRoot = resolve(process.cwd(), ".aieos", "grok-worktrees");
  const worktreePath = resolve(sandboxRoot, safeName(traceId));
  mkdirSync(sandboxRoot, { recursive: true });
  rmSync(worktreePath, { recursive: true, force: true });

  await execFileAsync(
    "git",
    ["-C", repoRoot, "worktree", "add", "--detach", worktreePath, "HEAD"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );

  return {
    path: worktreePath,
    isolated: true,
    cleanup: async () => {
      try {
        await execFileAsync("git", ["-C", repoRoot, "worktree", "remove", "--force", worktreePath], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch {
        // Best-effort: if worktree removal fails, leave it for manual cleanup.
      }
      rmSync(worktreePath, { recursive: true, force: true });
    },
  };
}

async function tryGitAsync(cwd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

function safeName(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]/g, "_");
}
