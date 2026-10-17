---
name: implement
agent: code-agent
description: 'Implement a PRD-defined feature. Triggers: 구현/만들어/추가해줘/implement/feature. Follow the code-agent steps. Use bugfix or refactor for those intents.'
---

# implement (code-agent default)

Follow the code-agent steps and gate-philosophy. For AWS reads, follow `../../harness-library/aws-readonly-policy.md` and prefer `sugo_aws_context`. Follow `../../harness-library/code-quality-policy.md` for comments and names.

1. prereq: Verify the session and PRD. Load rules, harnesses, and CLAUDE.md with `sugo_get_project_context`.
2. baseline: If §4.0 signals exist, record the green baseline before editing with `sugo_record_test_evidence`.
3. tools: Load tools listed in code_start `harnessToolMenu` (§2).
4. inspect: Use `sugo_explore` AST output to understand structure and analyze REQ-*.
5. design: Summarize non-obvious decisions and obtain user approval when required.
6. implement: Make the change, compile, and perform local verification.
7. format: Run the detected formatter.
8. cross-check: Call `sugo_analyze(changedFiles)` (§4.1).
9. handoff: Use `sugo_chain` to hand off to test-agent. This is a convention, not a server gate, but do not leave the next agent without context.

success: Pass code_done and hand off to test-agent.
on_failure: Report the blocking gate and satisfy it. Do not bypass it with a label. Use an explicit label only when the environment is unavailable.
