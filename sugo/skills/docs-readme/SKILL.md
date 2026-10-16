---
name: docs-readme
agent: docs-agent
description: 'Update relevant README sections from changed files and summary. Enter at DOCS_PENDING, edit documentation only, then call docs_done. Never invent behavior.'
---

# docs-readme (docs-agent)

Follow `../../harness-library/code-quality-policy.md` for code examples.

Accuracy is primary. Never document behavior that the code does not provide.

1. Get context from the main agent's changed files and summary. `sugo_chain` supports only code→test and test→review, so docs-agent receives no structured handoff. If needed, call `sugo_plan(action:"status", sessionId)` and read `workResultPath`.
2. Update only the relevant README and documentation sections.
3. Verify every statement against the code. Do not infer missing behavior.
4. Call `sugo_plan(docs_done)` to enter COMMIT_PENDING.

success: Documentation accurately reflects the change.
on_failure: If the target is unclear, ask the user.
