# Project Structure

> 🚧 MVP structure — Web-first, zero external infrastructure dependencies.

```
ai-engineer-os/
├── apps/
│   └── web/                       # Web client (Vite + React)
│       ├── src/
│       │   ├── components/        # UI components
│       │   ├── stores/            # Zustand state management
│       │   ├── hooks/             # React hooks
│       │   └── services/          # API client
│       └── public/
│
├── core/                          # Backend (Node.js, no framework)
│   ├── server.ts                  # HTTP entry point
│   ├── router.ts                  # Request routing
│   ├── workspace/                 # Project workspace management
│   │   ├── scanner.ts             # Project structure scanner
│   │   ├── watcher.ts             # File change watcher
│   │   └── sandbox.ts             # Git worktree sandbox
│   ├── agent/                     # Agent runtime
│   │   ├── orchestrator.ts        # Agent coordination
│   │   ├── planner.ts             # Task decomposition
│   │   ├── developer.ts           # Code modification agent
│   │   ├── reviewer.ts            # Code review agent
│   │   └── tools/                 # Tool implementations
│   │       ├── file.ts            # read_file / write_file / search
│   │       ├── terminal.ts        # command execution
│   │       └── git.ts             # diff / commit / branch
│   ├── memory/                    # Project memory
│   │   ├── scanner.ts             # Initial project scan
│   │   ├── store.ts               # Memory CRUD
│   │   └── indexer.ts             # Code indexing
│   └── db/                        # SQLite (via better-sqlite3)
│       ├── schema.ts              # Table definitions
│       ├── migrations/            # Schema migrations
│       └── seed.ts                # Seed data
│
├── packages/                      # Shared packages (workspace)
│   ├── ui/                        # Shared UI components
│   ├── types/                     # TypeScript type definitions
│   └── config/                    # Shared configuration
│
├── docs/                          # Documentation
│   ├── assets/
│   ├── architecture.md
│   ├── agent-system.md
│   ├── project-structure.md
│   └── getting-started.md
│
├── package.json                   # Root workspace config
└── turbo.json                     # Turborepo config
```

## Layer Overview

### 1. Web Client (`apps/web/`)

The user interface. Vite + React + TypeScript.

- **File Tree** — Project file explorer
- **Monaco Editor** — Code editing with AI inline features
- **Agent Control Center** — Plan view, tool calls, logs, task status
- **Settings** — AI provider configuration

### 2. Core Backend (`core/`)

The intelligence and workspace layer. Pure Node.js/TypeScript, no framework dependency.

| Module       | Responsibility                                   |
| ------------ | ------------------------------------------------ |
| `workspace/` | Scan, watch, and sandbox the target project      |
| `agent/`     | Agent orchestration, planning, execution, review |
| `memory/`    | Persistent project understanding                 |
| `db/`        | SQLite storage for sessions, memory, artifacts   |

### 3. Agent Tools (`core/agent/tools/`)

Standardized tool interface:

| Tool               | Permission | Description                      |
| ------------------ | ---------- | -------------------------------- |
| `file.read`        | Read       | Read file or directory           |
| `file.write`       | Write      | Write file with diff tracking    |
| `file.search`      | Read       | Full-text code search            |
| `terminal.run`     | Execute    | Run command in project directory |
| `terminal.install` | Execute    | Install dependencies             |
| `git.diff`         | Read       | Show uncommitted changes         |
| `git.commit`       | Write      | Create a commit                  |

### 4. Data Layer (`core/db/`)

SQLite via `better-sqlite3`.

| Table            | Purpose                              |
| ---------------- | ------------------------------------ |
| `sessions`       | Agent conversation sessions          |
| `tasks`          | Task definitions and state           |
| `tool_calls`     | Tool execution history               |
| `project_memory` | Persistent project understanding     |
| `artifacts`      | Generated artifacts (diffs, patches) |

### 5. Shared Packages (`packages/`)

- **`@aieos/ui`** — Shared UI components (button, modal, diff viewer)
- **`@aieos/types`** — TypeScript interfaces
- **`@aieos/config`** — Shared constants and utilities
