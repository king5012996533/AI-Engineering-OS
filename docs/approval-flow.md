# Approval Flow

> Human-in-the-loop: every code change goes through a review → decide cycle before reaching the main branch.

## Flow

```
     Agent completes task
            │
            ▼
   ApprovalRequest created
            │
    ┌───────┴───────┐
    │               │
    ▼               ▼
  Notify user    Show diff in Monaco
    │               │
    └───────┬───────┘
            │
            ▼
       User decides
            │
    ┌───────┼───────────┐
    │       │           │
    ▼       ▼           ▼
 Approved  Rejected  Changes Requested
    │       │           │
    │       │           ▼
    │       │      Agent revises
    │       │           │
    │       │           ▼
    │       │      New version created
    │       │           │
    │       └──────┬────┘
    │              │
    ▼              ▼
 Merge to      Archive
 main branch   (kept for audit)
```

## Decision Types

| Decision            | Action  | Effect                                          |
| ------------------- | ------- | ----------------------------------------------- |
| `approved`          | Merge   | Changes applied to main branch via git merge    |
| `rejected`          | Archive | Changes discarded, artifact marked as rejected  |
| `changes_requested` | Revise  | Agent receives feedback and creates new version |

## UI Integration

Decisions are made directly in Monaco's diff view:

```
┌───────────────────────────────────────┐
│  Diff: auth.ts                        │
│                                       │
│  - old token validation               │
│  + new token validation with refresh  │
│                                       │
│  ┌─────────┐  ┌──────────┐  ┌──────┐ │
│  │ Approve │  │ Reject   │  │ Edit  │ │
│  └─────────┘  └──────────┘  └──────┘ │
└───────────────────────────────────────┘
```
