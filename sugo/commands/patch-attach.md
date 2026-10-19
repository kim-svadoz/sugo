---
description: 'Register code changes already completed in the current conversation as the next verified patch of an existing Sugo task.'
argument-hint: [work-result.md path] [user intent]
---

Register code changes already completed in the current session in an existing Sugo lineage. This command is post-processing: do not use it to start or perform the product-code change itself. Input: $ARGUMENTS

1. Resolve the owning Sugo result. If no path was supplied, search only the current registered project under `sugo/features/**/work-result*.md`, show concise title/version candidates, and ask the user to choose. If multiple candidates remain, never guess. The server rejects a result outside this project's `sugo/features` tree or without an existing Dashboard lineage.
2. Inspect the current conversation, `git status --short`, diff, and relevant history. The supplied work-result selects the parent lineage; it is not the source of the new change. Reconstruct the new patch from the conversation and the actual Git delta. Summarize the user's intent as the patch seed. Show every changed/untracked file and mark which files are attributable to this conversation. Ask the user to confirm the exact include list whenever any file is unrelated or attribution is uncertain. Never silently attach the whole dirty tree. If no completed code delta exists, stop instead of implementing one.
3. Call `sugo_plan(action:"start", projectPath, featureName, workResultPath, seed, patchProvenance:"captured-post-hoc", postHocChangedFiles:[confirmed repository-relative paths], postHocBaseRevision?)`. For dirty changes the server captures HEAD automatically. If the change is already committed, derive and show the verified pre-change revision before calling. Then run the normal `/sugo:patch` chain without skipping any action or gate.
4. Create `PRD-patch-vN.md` from the actual delta. The server writes the `captured-post-hoc` provenance and Git baseline; distinguish reconstructed intent from executed evidence.
5. Treat existing changed files as the implementation input. Still run analyze, targeted/full tests, independent review, documentation, runtime verification, user confirmation, work-result generation, commit, and Dashboard lineage sync exactly as a native patch requires.
6. Stop on `POST_HOC_BASELINE_REQUIRED`, `POST_HOC_SCOPE_REQUIRED`, `POST_HOC_SCOPE_INVALID`, `POST_HOC_DUPLICATE`, or `POST_HOC_LINEAGE_NOT_FOUND`. Explain the corrective action. Never fabricate a baseline, file scope, lineage, or red test.

success: The existing change is recorded as the next patch in the existing Run, all current patch gates pass, and the work result states `captured-post-hoc` provenance.
on_failure: Leave the change unregistered and report the missing lineage, baseline, or evidence.
