# Getting Started

> 🚧 AI Engineering OS is in early development. MVP targets a web-first experience with zero external infrastructure dependencies.

## Prerequisites

| Requirement | Version |
| ----------- | ------- |
| Node.js     | 18.x    |
| pnpm        | 9+      |
| Git         | 2.40+   |

No Rust, no PostgreSQL, no Docker. Just Node.js and a browser.

## Installation

```bash
# Clone the repository
git clone https://github.com/king5012996533/AI-Engineering-OS.git
cd AI-Engineering-OS

# Install dependencies
pnpm install

# Start development
pnpm dev
```

This starts:

- **Web app** — The main interface at `http://localhost:5173`
- **Core service** — Backend at `http://localhost:3001`

## Quick Start

### 1. Open AI Engineering OS

Navigate to `http://localhost:5173` in your browser.

### 2. Open or Create a Project

Use the project selector to open an existing local project or create a new one.

### 3. Make Your First Request

In the Agent Control Center, describe what you want:

```text
Add a payment system with Stripe integration.
```

### 4. Review the Plan

The Planner Agent decomposes your request into a task graph:

```text
✓ Analyze project structure
✓ Create database schema for payments
✓ Add Stripe API integration
✓ Create checkout endpoint
✓ Build payment UI
✓ Write tests
```

### 5. Execute and Approve

- Each task executes in sequence
- Review code changes with inline diff highlights
- Approve or request changes per task

### 6. Commit

After approval, changes are applied to a sandbox branch. Merge when ready.

## Configuration

### AI Provider

Configure your AI provider in the app's settings panel:

```typescript
{
  provider: "openai",        // openai | anthropic | deepseek | custom
  model: "deepseek-chat",   // or any OpenAI-compatible model
  baseUrl: "https://api.deepseek.com",
  apiKey: "sk-..."
}
```

The system is model-agnostic. Any OpenAI-compatible API works.

### Project Memory

Project Memory is automatically built on first scan. Storage location: `<project>/.aieos/memory.json`

### Sandbox Mode

Agent operations run in an isolated git worktree by default. No Docker required.

## Documentation

- [Architecture](./architecture.md) — System design overview
- [Protocol](./protocol.md) — Core protocol definitions (the foundation)
- [Agent System](./agent-system.md) — Agent roles, tasks, and tools
- [Project Workspace](./project-workspace.md) — Directory layout and layer responsibilities
- [Approval Flow](./approval-flow.md) — Human-in-the-loop decision cycle
- [Artifact Lifecycle](./artifact-lifecycle.md) — How agent outputs are versioned
