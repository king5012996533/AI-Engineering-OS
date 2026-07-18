# Protocol

> The core differentiator of AI Engineering OS. Not agents, not UI — **protocols**.

## Why Protocol First?

Models change every month. Infrastructure stays.

AI Engineering OS defines explicit communication contracts between every component. These contracts are what make the system extensible, auditable, and composable — not any specific model or tool.

```
┌──────────────────────────────────────────────────────┐
│                     Protocol Layer                    │
│                                                      │
│  Task    Agent    Event    Tool    Memory   Artifact │
│                                                    │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──┐│
│  │Create│ │Register│ │Emit  │ │Define│ │Store │ │Save│
│  │Assign│ │Discover│ │Query │ │Call  │ │Retr. │ │Ver │
│  │Track │ │Communic│ │Replay│ │Result│ │Index │ │Diff│
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──┘│
│                                                    │
└──────────────────────────────────────────────────────┘
```

## Protocol Catalog

### Task Protocol

**File**: `packages/protocol/src/task.ts`

How work is defined, assigned, and tracked.

| Concept      | Type                        |
| ------------ | --------------------------- |
| `TaskNode`   | A single unit of work       |
| `TaskGraph`  | Dependency graph of tasks   |
| `TaskStatus` | Lifecycle state machine     |
| `TaskEvent`  | State transitions as events |

### Agent Protocol

**File**: `packages/protocol/src/agent.ts`

How agents register capabilities and communicate.

| Concept           | Type                     |
| ----------------- | ------------------------ |
| `AgentDefinition` | Role, permissions, tools |
| `AgentCapability` | Schema-typed capability  |
| `AgentMessage`    | Structured IPC message   |

### Event Protocol

**File**: `packages/protocol/src/event.ts`

How system activity is observed and recorded.

| Concept       | Type                              |
| ------------- | --------------------------------- |
| `SystemEvent` | Typed event with trace ID         |
| `EventStore`  | Append + query + replay interface |

### Artifact Protocol

**File**: `packages/protocol/src/artifact.ts`

How agent outputs are versioned and stored.

| Concept         | Type                          |
| --------------- | ----------------------------- |
| `Artifact`      | Versioned output with lineage |
| `ArtifactStore` | Save, get, list-by-task       |

### Approval Protocol

**File**: `packages/protocol/src/approval.ts`

How human-in-the-loop decisions are managed.

| Concept           | Type                                    |
| ----------------- | --------------------------------------- |
| `ApprovalRequest` | Pending human decision                  |
| `Decision`        | approved / rejected / changes_requested |

## Design Principles

1. **Schema first** — Every protocol is defined as a Zod schema. Validation, inference, and documentation from a single source of truth.

2. **Versioned contracts** — Protocols evolve with explicit version bumps. Breaking changes require a new major version.

3. **Audit by default** — Every protocol produces structured events. The event store is the system's memory and audit trail.

4. **No framework lock-in** — Protocols are plain TypeScript + Zod. No NestJS decorators, no Express middleware, no runtime dependency beyond what each implementation chooses.
