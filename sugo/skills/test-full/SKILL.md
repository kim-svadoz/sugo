---
name: test-full
agent: test-agent
description: 'Run the complete suite with the full-verification command and record evidence. Also triggers for 전체 테스트 돌려줘/full test/회귀 확인 outside the pipeline.'
---

# test-full (test-agent)

Follow `../../harness-library/code-quality-policy.md` for test comments and names. Apply the same specification-based, tamper-resistant evidence rules as targeted testing, but run the full suite.

1. Load refs. In a contract-required pipeline session, red evidence already exists from `contract_start` through `contract_done`. Record green with the same `contractId` by calling `sugo_record_contract_evidence(phase:"green", ...)`.
2. Run every project test with the full-verification command: `gradlew check` or `mvn verify|install`. A plain test command fails §4.2.
3. Classify new failures as spec_not_met and existing failures as regression. Identify the regression cause.
4. Record required evidence with `sugo_record_test_evidence`; the server prevents tampering.
5. Produce a coverage map for each AC, response field, and required red→green contract transition.

success: The full suite is green and evidence records the full-verification command.
on_failure: Record failures accurately. Never claim pass when exitCode is nonzero. If the environment is unavailable, mark it unverified to prevent an infinite auto-loop.
