# Artifact Lifecycle

> How agent outputs are versioned, stored, and linked across the system.

## Lifecycle

```
   Agent executes
        │
        ▼
   Artifact Created ─── version: 1, parentId: null
        │
        ├── Human requests changes
        │       │
        │       ▼
        │   Artifact Updated ─── version: 2, parentId: v1
        │
        ├── Human approves
        │       │
        │       ▼
        │   Artifact Merged ─── moved to main workspace
        │
        └── Human rejects
                │
                ▼
            Artifact Archived ─── kept for audit, not applied
```

## Artifact Types

| Type            | Description                    | Example          |
| --------------- | ------------------------------ | ---------------- |
| `plan`          | Task graph produced by Planner | `plan-abc123`    |
| `code_diff`     | File changes from Developer    | `diff-def456`    |
| `file_content`  | Full file read for context     | `content-ghi789` |
| `test_result`   | Test output from Tester        | `test-jkl012`    |
| `review_report` | Review findings from Reviewer  | `review-mno345`  |
| `patch`         | Composable set of changes      | `patch-pqr678`   |

## Storage

Artifacts are stored in SQLite with JSON-serialized payloads. Each artifact carries its own version history via `parentId` chain. The storage interface is defined in the Artifact Protocol (`packages/protocol/src/artifact.ts`).
