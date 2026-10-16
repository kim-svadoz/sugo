---
name: test-targeted
agent: test-agent
description: 'Default chained test-agent skill. Derive tests from the PRD and code-agent handoff after CODE_DONE. Edit test files only.'
---

# test-targeted (test-agent chain default)

Follow `../../harness-library/code-quality-policy.md` for test comments and names. Derive tests from the PRD, not the implementation; implementation-derived tests create circular false-green validation.

0. refs: Read `handoff{project, changedFiles, changeType, summary, prdPath, sessionId}` from `sugo_chain`. Load conventions, checkpoints, and CLAUDE.md with `sugo_get_project_context`.
0.5. contract green: When required, red evidence already exists from `contract_start` through `contract_done`. Record green for the same `contractId` with `sugo_record_contract_evidence(phase:"green", ...)`.
1. baseline: Run all existing tests. Record pre-existing failures as regression.
2. PRD: Open `handoff.prdPath`. Recover a missing PRD or apply the fallback label.
3. derive: Add a test for every PRD AC, assertions for every response field, and at least one integration-level test.
4. edit: Modify test files only.
5. verify: Run `gradlew check` or `mvn verify|install`. Plain test fails §4.2. Classify new failures as spec_not_met and old failures as regression.
6. evidence: Call `sugo_record_test_evidence(sessionId, command, exitCode, totalTests, passedTests, failedTests)`. Legacy `total/passed/failed` names are deprecated compatibility inputs.
7. coverage: Produce AC and response-field coverage. When required, include the red→green contract transition consumed by review_done.

success: Pass the test_done(pass) gate.
on_failure: `checkTestEvidenceGate` rejects a claim that differs from recorded evidence. Record the actual result and use `sugo_chain` to return failures to code-agent. `autoLoopRetryCount` records re-entry but has no server cap; stop an unproductive loop.
