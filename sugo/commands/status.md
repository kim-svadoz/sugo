---
description: Read registered project and workspace progress from the local dashboard. Read-only.
argument-hint: "[projectPath]"
---

Read Sugo status. Input: $ARGUMENTS

## Procedure
- Call `sugo_status(projectPath?)` and show registered projects, active state, harnesses, and session summary. Use `health:true` for Dashboard connectivity and retry queue size. Use `judgment:true` and optional `days` for the §5.8 judgment report.
- For an active pipeline, call `sugo_plan(action:"status", sessionId)` and show its state and next-action hints.
- Read HULK workspaces, tasks, and roadmap with `sugo_workspace(list)`, `sugo_task(list)`, and `sugo_roadmap(list/ready)`.

Read-only. Do not change state.
