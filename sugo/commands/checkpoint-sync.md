---
description: Pull Dashboard checkpoints into local .claude/rules.
argument-hint: "[projectPath]"
---

Sync Dashboard checkpoints to local rules. Input: $ARGUMENTS

## Procedure
- Call `sugo_checkpoint(action:"pull", workspace, projectPath)`. It reads `GET /api/workspaces/checkpoint-sync` and writes each checkpoint to `.claude/rules/<category>/<slug>.md`; general uses the root.
- If Dashboard is disabled or unavailable, make no change. Local state is the safe fallback and the pipeline must continue.

## Boundary
- Dashboard-owned checkpoints flow down to local files. Locally created checkpoints use the push direction.
