---
description: 'Attach changes already made in the current conversation to an existing Sugo task as the next verified patch.'
argument-hint: <work-result.md path> [user intent]
---

Attach the current session's completed or in-progress code changes to an existing Sugo lineage. Input: $ARGUMENTS

1. Require the prior Sugo `work-result.md` (or versioned patch result) that owns the change. If it is ambiguous, ask the user to choose; never guess the lineage.
2. Inspect the current conversation, `git status`, diff, and relevant history. Summarize the user's intent as the patch seed. Do not claim evidence that was not observed.
3. Call `sugo_plan(action:"start", projectPath, featureName, workResultPath, seed, patchProvenance:"captured-post-hoc", postHocBaseRevision?)`. For dirty changes the server captures HEAD automatically. If the change is already committed, pass the verified pre-change revision. Then run the normal `/sugo:patch` chain without skipping any action or gate.
4. Create `PRD-patch-vN.md` from the actual delta. The server writes the `captured-post-hoc` provenance and Git baseline; distinguish reconstructed intent from executed evidence.
5. Treat existing changed files as the implementation input. Still run analyze, targeted/full tests, independent review, documentation, runtime verification, user confirmation, work-result generation, commit, and Dashboard lineage sync exactly as a native patch requires.
6. If a baseline revision cannot be established from Git, stop with `POST_HOC_BASELINE_REQUIRED`. Never fabricate a pre-change baseline or a red test.

success: The existing change is recorded as the next patch in the existing Run, all current patch gates pass, and the work result states `captured-post-hoc` provenance.
on_failure: Leave the change unregistered and report the missing lineage, baseline, or evidence.
