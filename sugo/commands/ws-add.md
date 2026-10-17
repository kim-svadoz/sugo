---
description: Create a workspace that groups related projects. Dashboard “Add Domain” copies this command.
argument-hint: <workspace 이름>
---

Create a workspace. Input: $ARGUMENTS

## Procedure
- Create it with `sugo_workspace(action:"add", name)` at `~/.claude/sugo/work/<name>/workspace.json`.
- Register the project with `sugo_add(projectPath, workspace:<name>)`.
- A workspace groups tasks, checkpoints, specifications, history, and roadmap. Creation syncs to Dashboard without blocking.

Related: `sugo_workspace(list/status/delete)`.
