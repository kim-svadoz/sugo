---
name: bugfix
agent: code-agent
description: 'Fix defects with a failing reproduction first. Triggers: 버그/에러/안 돼/고쳐줘/bug/fix/broken. Excludes test-only, docs, and refactoring requests. Routed by sugo_route.'
---

# bugfix (code-agent)

Follow `../../harness-library/code-quality-policy.md` for comments and names.

Do not modify code before reproducing the defect. Keep this order:

1. Add a failing regression test. If reproduction fails, isolate the cause first.
2. Load context with `sugo_get_project_context` and inspect relevant code with `sugo_explore`.
3. Fix the root cause with the smallest valid change. Do not mask symptoms.
4. Confirm the regression test changes from red to green and the existing suite stays green.
5. If a PRD exists, call `sugo_analyze`, then hand off to test-agent with `sugo_chain`.

success: The regression test changed from red to green, no regression remains, and handoff is complete.
on_failure: If reproduction fails, report that fact and request the missing evidence. Do not guess.
