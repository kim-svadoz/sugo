---
description: 'Run review-stage harness validation from validation.yaml checks[]. Some checks use server evidence.'
argument-hint: "[projectPath]"
---

Run harness validation. Input: $ARGUMENTS

## Procedure
- Call `sugo_validate(sessionId, validationResults)`. For every applied harness `validation.yaml` `checks[]` item `{id, description, severity}`, review-agent submits `{harnessId, checkId, passed, note?}`.
- For a check with `auto`, the server measures file presence, content patterns, tsconfig fields, or other declared evidence and overrides the agent verdict. Each result has `source: "verified" | "self-reported"`. `verified` is server evidence; `self-reported` is the submitted claim. Mismatches enter `contradictions`. Never pass an unchecked item.
- An unknown checkId enters `fabricated` and is excluded from the verdict.
- In the pipeline, review-agent runs this read-only command after review_start. Results enter work-result.

## Rules
- A `verified` failure is evidence to fix. Never claim pass for an unchecked `self-reported` item.
- Validate only judges; code-agent performs fixes.
- review_done requires both invocation and verified success. Missing invocation returns `VALIDATE_NOT_CALLED`; a failed auto check returns `VALIDATE_VERIFIED_FAILURE`. Resolve either before review_done.
- A self-reported failure is not a hard gate because most checks are not server-verified. Decide whether to return it for rework. `autoLoopRetryCount` records re-entry and has no hard cap.
