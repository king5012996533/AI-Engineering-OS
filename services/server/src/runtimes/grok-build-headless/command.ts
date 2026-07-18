// Grok Build Headless Bridge — Command Builder
//
// Assembles the `grok -p` invocation from a ToolCallTask and RuntimeContext.
// Pure function: no I/O, no side effects. The adapter runs the produced command.

import type { RuntimeContext, ToolCallTask } from "@aieos/protocol";

/**
 * streaming-json event types we understand. Treated as open-ended —
 * unknown types are preserved by the mapper, not dropped.
 */
export type GrokStreamingEvent =
  | { type: "text"; data: string }
  | { type: "thought"; data: string }
  | {
      type: "end";
      stopReason?: string;
      sessionId?: string;
      requestId?: string;
      usage?: unknown;
      num_turns?: number;
      modelUsage?: unknown;
    }
  | { type: "error"; message: string; usage?: unknown }
  | { type: "max_turns_reached" }
  | { type: "auto_compact_started"; percentage: number }
  | { type: "auto_compact_completed" }
  | { type: "auto_compact_failed"; error: string }
  | { type: "auto_compact_cancelled" }
  | { type: "auto_continue_completed"; total_tokens: number }
  | { type: "image_compressed"; message: string }
  | { type: string; [key: string]: unknown };

export type GrokCommandOptions = {
  /** Absolute path to the isolated worktree where Grok will run. */
  cwd: string;
  /** Natural-language prompt. Defaults to task.instructions. */
  prompt?: string;
  /** Model id. Defaults to `grok-build`. */
  model?: string;
  /** Auto-approve tool executions. Headless requires this; deny rules guard destructive ops. */
  yolo?: boolean;
  /** Hard cap on agentic turns. */
  maxTurns?: number;
  /** Deny rules (e.g. `Bash(git push*)`). Always includes destructive defaults. */
  denyRules?: string[];
  /** Extra rules appended to the system prompt. */
  rules?: string;
  /** Reasoning effort level. */
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  /** Path to a custom grok binary. Defaults to `grok` on PATH. */
  binary?: string;
};

const DEFAULT_BINARY = "grok";
const DEFAULT_MODEL = "grok-build";

/**
 * Deny rules applied to every invocation. These are the minimum guardrails
 * for unattended runs — they block the obviously destructive git ops that
 * would escape the worktree or rewrite shared history.
 */
const DEFAULT_DENY_RULES: string[] = [
  "Bash(git push*)",
  "Bash(git config*)",
  "Bash(git rebase*)",
  "Bash(git reset --hard*)",
  "Bash(git clean -fd*)",
  "Bash(rm -rf*)",
];

export type BuiltCommand = {
  binary: string;
  args: string[];
  env: NodeJS.ProcessEnv;
};

/**
 * Build the `grok -p` command for a headless single-turn run.
 *
 * The command always uses:
 * - `--output-format streaming-json` (we parse the newline-delimited stream)
 * - `--cwd <sandbox>` (Grok writes inside the isolated worktree, never the main repo)
 * - `--yolo` (headless cannot prompt; deny rules are the guardrail)
 * - `--no-auto-update` (avoid update checks in CI/automation paths)
 *
 * The caller is responsible for creating the worktree before invoking.
 */
export function buildGrokCommand(task: ToolCallTask, options: GrokCommandOptions): BuiltCommand {
  const binary = options.binary ?? DEFAULT_BINARY;
  const prompt = (options.prompt ?? task.instructions).trim();
  if (!prompt) {
    throw new Error("GrokBuildHeadlessRuntime: prompt is empty (task.instructions is required).");
  }

  const denyRules = [...DEFAULT_DENY_RULES, ...(options.denyRules ?? [])];

  const args: string[] = [
    "-p",
    prompt,
    "--output-format",
    "streaming-json",
    "--cwd",
    options.cwd,
    "--model",
    options.model ?? DEFAULT_MODEL,
    "--yolo",
    "--no-auto-update",
  ];

  for (const rule of denyRules) {
    args.push("--deny", rule);
  }

  if (options.maxTurns !== undefined) {
    args.push("--max-turns", String(options.maxTurns));
  }

  if (options.rules) {
    args.push("--rules", options.rules);
  }

  if (options.reasoningEffort) {
    args.push("--reasoning-effort", options.reasoningEffort);
  }

  const env: NodeJS.ProcessEnv = { ...process.env };
  // Suppress update chatter on stderr so the streaming-json stream stays clean.
  env.GROK_DISABLE_AUTOUPDATER = env.GROK_DISABLE_AUTOUPDATER ?? "1";

  return { binary, args, env };
}

/**
 * Resolve the worktree cwd for a runtime context.
 *
 * The adapter passes the already-created worktree path via context.metadata.worktreePath.
 * If absent, falls back to workspacePath — but that is unsafe for write operations
 * and the adapter will warn loudly.
 */
export function resolveWorktreeCwd(context: RuntimeContext): { cwd: string; isolated: boolean } {
  const worktreePath = context.metadata?.worktreePath;
  if (typeof worktreePath === "string" && worktreePath) {
    return { cwd: worktreePath, isolated: true };
  }
  return { cwd: context.workspacePath, isolated: false };
}
