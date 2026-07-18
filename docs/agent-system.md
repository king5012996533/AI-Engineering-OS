# Agent System

> 🚧 **MVP Scope**: v0.1 implements **3 roles** — Planner, Developer, Reviewer.
> Architect, Tester, and DevOps are defined in the protocol but not yet implemented. Multi-agent handoff is staged for v0.3.

AI Engineering OS treats software engineering as a multi-role discipline. Instead of a single general-purpose agent, it orchestrates a team of specialized AI agents, each with defined responsibilities, permissions, and execution contexts.

## Agent Team Structure

```
            Product Goal
                ↓
          Planner Agent
              ↓
    ┌──────────┴──────────┐
    ↓                     ↓
Developer             Reviewer
```

### Roles

#### Planner Agent

The entry point for all user requests. Responsible for understanding intent, decomposing work, and generating a task graph.

| Property   | Value                       |
| ---------- | --------------------------- |
| Permission | Read                        |
| Output     | Task plan, dependency graph |
| Scope      | Project-wide                |

**Responsibilities:**

- Analyze user request and clarify ambiguity
- Decompose into atomic, executable tasks
- Identify dependencies between tasks
- Assign tasks to appropriate agent roles
- Estimate scope and risk

#### Developer Agent

Executes the implementation. Adds, modifies, and deletes code.

| Property   | Value                         |
| ---------- | ----------------------------- |
| Permission | Write (sandbox)               |
| Output     | Code changes, file operations |
| Scope      | Task-level                    |

**Responsibilities:**

- Implement features according to plan
- Write tests
- Follow project conventions
- Self-review before requesting human approval

#### Reviewer Agent

Audits code for quality, security, and correctness.

| Property   | Value                         |
| ---------- | ----------------------------- |
| Permission | Read                          |
| Output     | Review comments, issues found |
| Scope      | Change-level                  |

**Responsibilities:**

- Security vulnerability detection
- Code quality assessment
- Architecture compliance check
- Performance impact analysis
- Suggest improvements

## Task Protocol

The protocol governing how tasks flow through the agent system.

```
1. User Request
       ↓
2. Planner: Decompose → Task Graph
       ↓
3. Agent Router: Assign tasks to agents
       ↓
4. Agent: Execute → Tool Calls → Result
       ↓
5. Reviewer: Validate Result
       ↓
6. [If failed] → Return to step 3
       ↓
7. [If passed] → Present to Human
       ↓
8. Human: Approve / Reject / Modify
```

### Task Lifecycle

| State               | Description                   |
| ------------------- | ----------------------------- |
| `pending`           | Created but not assigned      |
| `assigned`          | Assigned to an agent          |
| `in_progress`       | Agent is executing            |
| `awaiting_review`   | Completed, awaiting reviewer  |
| `in_review`         | Under review                  |
| `changes_requested` | Review found issues           |
| `awaiting_approval` | Passed review, awaiting human |
| `approved`          | Human approved                |
| `rejected`          | Human rejected                |
| `failed`            | Execution error               |

## Tool System

All tools follow a standardized interface:

```typescript
interface Tool {
  name: string;
  description: string;
  permission: "read" | "write" | "execute";
  execute(input: unknown): Promise<ToolResult>;
}

interface ToolResult {
  success: boolean;
  output: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}
```

### Built-in Tools (v0.1)

| Tool               | Permission | Description                      |
| ------------------ | ---------- | -------------------------------- |
| `file.read`        | Read       | Read file or directory contents  |
| `file.write`       | Write      | Write file with diff tracking    |
| `file.search`      | Read       | Full-text code search            |
| `terminal.run`     | Execute    | Run terminal commands in project |
| `terminal.install` | Execute    | Install dependencies             |
| `git.diff`         | Read       | Show uncommitted changes         |
| `git.commit`       | Write      | Create a commit                  |
