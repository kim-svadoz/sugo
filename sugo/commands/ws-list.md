---
description: List workspaces and remaining work so the user can choose where to resume. Read-only.
---

Show the workspace list.

## Procedure

Call `sugo_workspace(action:"list")` once. Each workspace includes `projectCount`, `taskCount`, and `resumableSessionCount`.

## Output

Return one table: name, project count, task count, resumable session count, and project paths.

Emphasize workspaces whose `resumableSessionCount` is above zero. This command answers where to resume. Leave session IDs and blockers to `/sugo:ws-status <name>`.

If no workspace exists, tell the user to create one with `/sugo:ws-add <name>`.

## Rules

- Read-only. Do not change state.
- Hide soft-deleted workspaces by default. Use `includeDeleted:true` only when the user asks to find deleted workspaces.
- Do not infer completion from counts. `taskCount` includes completed and canceled tasks.
