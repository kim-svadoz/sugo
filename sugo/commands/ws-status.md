---
description: Workspace terminal dashboard. Show sessions, tasks, and roadmap, and identify where to resume. Read-only.
argument-hint: "<워크스페이스 이름>"
---

Show one workspace in the terminal. Input: $ARGUMENTS

The purpose is later resumption. A new terminal session must show which session stopped, where, and why.

## Procedure

1. If name is absent, call `sugo_workspace(action:"list")` and ask the user to choose.
2. Call `sugo_workspace(action:"status", name)` once for tasks, roadmap, and sessions.
3. For each resumable session, call `sugo_plan(action:"status", sessionId)` and append next-action hints. If several exist, let the user choose. Never select one automatically.

## Output

Use this order and omit empty sections.

**① Resumable sessions** (`resumable: true`) — first and most detailed. Show full session ID, `state`, `featureName`, last update, `blockers`, and changed-file count. Use server-provided `updatedAtLocal`, not UTC `updatedAt` or a manual conversion. `blockers` are measured server signals such as failed tests, failed review, and review retry count. Do not infer or alter them. The analyze lexical verdict is not a blocker.

**② Tasks** — group by `status`: `in_progress`, then `pending`, then others. Include `prd_ref` for resumption.

**③ Roadmap** — indent dependencies. Call `sugo_roadmap(action:"ready", workspace)` and mark nodes ready now. `{taskId}::REQ-CONFIRM` closes only after successful `sugo_plan(review_done)`; do not recommend manual completion.

**④ Summary counts** — put checkpoint, specification, and work-log counts on one line.

## Rules

- Read-only. Do not change state.
- Never shorten a session ID; the user must be able to copy it.
- If there are no sessions, state that the pipeline has not run. `sugo_plan(prd)` creates tasks for registered workspace projects, so all sections can be empty before the first run.
- Do not explain `state` unless asked. Point out the state only for a blocked session.
