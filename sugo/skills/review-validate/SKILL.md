---
name: review-validate
agent: review-agent
description: 'Default chained review-agent skill after TEST_DONE. Validate harness checks, use server evidence where available, and create work-result. Read-only: no edit, commit, or push.'
---

# review-validate (review-agent chain default, read-only)

Review diff comments and names against `../../harness-library/code-quality-policy.md`. Do not edit code. Produce only verdicts and reports.

1. Parse `handoff{project, changedFiles, changeType, summary, prdPath, sessionId}` from `sugo_chain`.
2. Call `sugo_get_project_context(projectPath, changedFiles)` for rules, applicable harnesses, and CLAUDE.md. Passing changedFiles limits harnesses to this change.
3. Treat the returned harness text as authoritative.
4. Check required format and style.
5. Before review_done, call `sugo_validate(sessionId, validationResults)`. Submit every applied `validation.yaml` `checks[]` item as `{harnessId, checkId, passed, note?}`. A declared `auto` check uses server evidence and overrides the submitted verdict with `source: verified`. Never pass an unchecked item.
6. A verified failure hard-blocks review_done with `VALIDATE_VERIFIED_FAILURE`; fix it and revalidate. A self-reported result remains advisory. Inspect `contradictions` for claim/evidence mismatches.
7. Before review_done, always call `sugo_check_lethal_trifecta(sessionId, tools)` under §P6-1. Inspect changed tool calls, MCP servers, network calls, and file reads. Determine private-data access, untrusted-input processing, and external communication from code, never names. If all three exist, pass a concrete `trifectaMitigation` to review_done.
8. Provide a factual Korean `summary`: at least 3 lines and 30 characters, with no padding. Use ASD-STE100-inspired Korean: one topic or action per short active sentence, consistent terms, and state→evidence→action→next-step order. Do not claim formal STE compliance. Put important choices and trade-offs in `reportDetails.designDecisions`; put remaining risks and limits in `reportDetails.knownLimitations`. The server builds tests, files, requirement coverage, and harness validation from session evidence. review_done stores one standard report as Markdown and Dashboard JSON. Never add an unsupported success claim.
9. Return to the main agent with `runtimeCheck{buildAttempted,testRun,runtimeVerified}` and metrics. Do not skip this step.

success: Evidence satisfies review_done gates for validation, lethal-trifecta and mitigation, user confirmation, summary quality, runtime verification, and contract evidence.
on_failure: Missing validate returns `VALIDATE_NOT_CALLED`; failed server checks return `VALIDATE_VERIFIED_FAILURE`. Self-report cannot override either. A self-reported-only failure is not a hard gate; decide whether to return it through `sugo_chain`. `autoLoopRetryCount` records re-entry without a server cap. A false unavailable-runtime claim is blocked separately. Missing trifecta inspection returns `LETHAL_TRIFECTA_NOT_CALLED`; a warning without mitigation returns `LETHAL_TRIFECTA_MITIGATION_REQUIRED`.

## Stale evidence snapshot (§4.3-R)

test_done stores `testPassedState`. Later green evidence does not update that snapshot. This can make all paths fail: `runtimeVerified:true` returns `RUNTIME_CLAIM_CONTRADICTS_EVIDENCE`; an unverified label returns `LABEL_CONTRADICTION`; no label returns `RUNTIME_UNVERIFIED_GATE_FAILED`. The forward-only pipeline cannot repeat test_done.

Only in this case, first record correct green evidence with `sugo_record_test_evidence`, then call `sugo_plan(test_reverify, sessionId, reverifyReason)`. Current failed evidence returns `REVERIFY_EVIDENCE_STILL_FAIL`. Reverification cannot hide failure; it adds `evidenceResnapshot` and lowers completion to `unverified`.
