# Grok Build Runtime Capability Audit

Date: 2026-07-18

## Conclusion

Grok Build can be used as a runtime engine reference and, later, as an execution backend behind AI Engineering OS.

It should not become the product core. AI Engineering OS keeps ownership of:

- Task lifecycle
- Event protocol
- Artifact persistence
- Approval workflow
- Workspace policy
- Runtime routing

Grok Build should sit behind a runtime bridge.

```text
AI Engineering OS
  -> Orchestrator
  -> Agent Runtime Interface
  -> Grok Build Bridge
  -> Grok Build Runtime

Grok Build tool calls
  -> Grok Build Bridge
  -> OS Tool Execution Layer
  -> audited tool result
  -> Grok Build Bridge
```

## Capabilities Found

### 1. Headless Mode

Grok Build supports non-interactive execution through headless mode.

Relevant paths:

- `crates/codegen/xai-grok-pager/docs/user-guide/14-headless-mode.md`
- `crates/codegen/xai-grok-pager/src/headless.rs`

Useful behavior:

- `-p` / `--single` accepts a prompt.
- `--prompt-json` and `--prompt-file` can pass structured input.
- `--output-format` supports `plain`, `json`, and `streaming-json`.
- `--session-id`, `--resume`, and `--continue` support session continuity.

This is enough for the first bridge version to call Grok Build as a child process.

### 2. Streaming Events

Headless mode can emit newline-delimited JSON events with `--output-format streaming-json`.

Known event types include:

- `text`
- `thought`
- `end`
- `error`
- `max_turns_reached`
- `auto_compact_started`
- `auto_compact_completed`
- `auto_compact_failed`
- `auto_compact_cancelled`

Bridge responsibility:

```text
Grok event -> AI Engineering OS TaskEvent
```

The event list must be treated as open-ended.

### 3. Permission Rules

Grok Build has allow/deny permission controls and a bypass mode.

Relevant options:

- `--permission-mode`
- `--allow`
- `--deny`
- `--tools`
- `--disallowed-tools`
- `--yolo`

AI Engineering OS should not expose `--yolo` as the default. Unattended mode is useful for CI, but product mode should prefer explicit approval.

Bridge policy:

- Read operations may be auto-allowed in a sandbox.
- Write and command operations should be captured as proposed artifacts.
- Dangerous commands should be denied or require explicit human approval.

### 4. Sandbox

Grok Build supports sandbox profiles.

Relevant path:

- `crates/codegen/xai-grok-pager/docs/user-guide/18-sandbox.md`

Profiles include:

- `off`
- `workspace`
- `read-only`
- `strict`
- `devbox`

Important finding:

Sandbox is applied to the entire Grok process, including built-in file tools and child processes.

AI Engineering OS should still treat sandbox as defense-in-depth, not the primary authorization layer.

### 5. Worktree Support

Grok Build has fast worktree support.

Relevant paths:

- `crates/codegen/xai-fast-worktree/src/api.rs`
- `crates/codegen/xai-fast-worktree/src/git/worktree.rs`
- `crates/codegen/xai-grok-pager/docs/user-guide/14-headless-mode.md`

There is a headless flag:

- `--worktree [NAME]`

Bridge recommendation:

AI Engineering OS should own workspace creation and naming first. Grok Build may run inside the OS-created worktree instead of creating its own unchecked workspace.

### 6. Diff and Patch Extraction

Grok Build has diff rendering and extraction utilities.

Relevant path:

- `crates/codegen/xai-grok-pager/src/diff.rs`

It can extract hunks from tool calls and produce unified patch text.

Bridge responsibility:

```text
Grok file/tool output
  -> unified patch
  -> Artifact(type: "patch" | "code_diff")
  -> ApprovalRequest
```

Do not directly merge or apply changes from Grok output.

## Risks

### Risk 1: Direct File Writes

If Grok writes files directly during execution, the bridge must run it inside an isolated worktree and capture `git diff` afterward.

Mitigation:

- Always run in an OS-managed worktree.
- Capture `git diff --unified=3` after execution.
- Convert diff into `Artifact`.
- Require approval before applying to the main workspace.

### Risk 2: Event Format Drift

Streaming events may change across Grok Build versions.

Mitigation:

- Mapper must be tolerant.
- Unknown events are preserved as raw runtime events.
- Only normalized fields are used by OS state.

### Risk 3: Product Boundary Drift

Grok Build has its own UI, session model, permissions, memory, and tool policy.

Mitigation:

- Use Grok Build as runtime only.
- Keep OS session, memory, approval, and artifact state independent.
- Do not import Grok UI state into OS state.

### Risk 4: Runtime Crash, Timeout, or OOM

Grok Build may crash, exceed the runtime timeout, or be killed by the host while it has already produced partial work.

Mitigation:

- Run each turn with a hard timeout.
- Terminate the runtime process on timeout.
- Extract the current `git diff --unified=3` from the isolated worktree before cleanup.
- Mark the extracted artifact as `partial`.
- Preserve runtime events emitted before the crash.
- Never discard partial code blindly; partial artifacts can still be reviewed, salvaged, or rejected.

## Recommended First Bridge

```text
services/server/src/runtimes/grok-build-bridge/
  adapter.ts
  mapper.ts
  events.ts
  patches.ts
  index.ts
```

## Integration Constraints

These constraints are architectural boundaries. Runtime integrations must obey them even when a vendor runtime offers shortcuts.

Grok Build MUST NOT:

- Bypass the AI Engineering OS artifact lifecycle.
- Directly mutate the main workspace.
- Own approval or merge decisions.
- Persist provider-specific state as canonical OS state.
- Replace the AI Engineering OS task graph.
- Emit UI-facing events without passing through the bridge mapper.
- Apply patches without an `ApprovalRequest`.
- Read secrets unless the workspace policy explicitly allows it.

AI Engineering OS MUST:

- Run runtime engines in an isolated workspace or worktree.
- Convert runtime output into `Artifact` records.
- Convert runtime progress into `SystemEvent` / `TaskEvent` records.
- Treat provider events as untrusted external input.
- Preserve unknown provider events as raw payloads without depending on them.
- Keep runtime-specific session IDs as metadata, not primary OS IDs.

### Tool Execution Layer Boundary

Grok Build may have its own built-in file, terminal, and git tools. AI Engineering OS must still own tool arbitration.

The target bridge flow is:

```text
Grok Build Runtime
  -> Bridge receives or normalizes tool request
  -> OS Tool Execution Layer checks policy
  -> OS Tool Execution Layer records audit log
  -> OS Tool Execution Layer executes inside worktree or sandbox
  -> Tool result returns to Bridge
  -> Bridge emits normalized RuntimeEvent
```

If a runtime can only execute tools internally, the bridge must compensate by running it in an OS-managed isolated worktree, capturing `git diff --unified=3`, and mapping every observable operation into runtime events. This is acceptable for MVP but not the final security model.

If a future contributor wants to "just call Grok directly", the answer is no. The runtime can execute work, but AI Engineering OS owns the workflow contract.

### Adapter Contract

```ts
export interface AgentRuntime {
  id: string;
  /** Initialize runtime environment: worktree, sandbox profile, trace context. */
  initialize(context: RuntimeContext): Promise<void>;
  /** Execute one tool-calling turn and stream normalized runtime events. */
  executeTurn(task: ToolCallTask): AsyncIterable<RuntimeEvent>;
  /** Extract the current proposed or partial diff as an artifact. */
  extractDiff(): Promise<Artifact>;
  /** Cleanup runtime process, handles, and temporary workspace state. */
  teardown(): Promise<void>;
}
```

### First Executable Flow

```text
User Goal
  -> Planner creates TaskGraph
  -> Developer Task selected
  -> Grok Build Bridge starts headless run
  -> tool requests mediated by OS Tool Execution Layer
  -> streaming-json events mapped to RuntimeEvent / TaskEvent
  -> git diff --unified=3 captured as Artifact
  -> ApprovalRequest created
  -> Human approves/rejects
```

## MVP Scope

Do not implement everything at once.

First version should include:

- One project path
- One user goal
- One Planner output
- One Developer task
- One runtime run
- One patch artifact
- One approval decision

Reviewer, Tester, DevOps, persistent memory, and multi-runtime routing can come after the first end-to-end loop works.
