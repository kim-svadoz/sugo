---
description: 'Continue completed work as a Patch. Reuse the existing Run from work-result.md and sync lineage to Dashboard.'
argument-hint: <work-result.md 경로> [seed 지시]
---

Run the Sugo patch pipeline. Input: $ARGUMENTS

## Procedure
1. Call `sugo_plan(action:"start", projectPath, featureName, workResultPath:<path>, seed?)`. A workResultPath selects patch mode.
   - Parent PRD: prefer sibling `prd.md`; otherwise use the newest `PRD-patch-v*.md`. Reject entry if neither exists.
   - Version: `computeNextPatchVersion` returns one above the maximum `(prd|work-result)-patch-vN.md`.
2. Run the same core chain as feat: clarify→prd→…→commit. Apply the TODO-SPEC contract from `/sugo:feat` steps 1, 2, 3, and 12 whenever the branch matches `feature/*`.
   - Preserve first-run artifacts. Append `PRD-patch-vN.md` and `work-result-patch-vN.md`.
   - Reuse the existing Run and record `patchInfo` with parentTaskId, patchVersion, and seed.
   - Store seed under `## 사용자 지시(seed)` in work-result.
   - Sync lineage to Dashboard.
   - After review-agent returns evidence, do not use Claude's own choice prompt. Publish summary and code artifacts with `request_review_confirmation`. Do not call `review_done` until `resume_with_decision` verifies Dashboard decision `확인, 진행`.
3. Limit this patch PRD to the delta. Infer commit type and version.

## Rules
- Without a work-result path, use `/sugo:feat`; this is not patch mode.
- For human policy decisions during implementation or verification, apply `/sugo:feat`'s human-decision blocking contract. Record `block_for_human` on the parent Task with the current `sessionId`, verify the Dashboard answer with `resume_with_decision`, then resume the same patch session at `resumeAction`.
