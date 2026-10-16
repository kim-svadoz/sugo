---
name: refactor
agent: code-agent
description: 'Improve structure without changing behavior. Add no tests; keep the existing suite green. Triggers: 리팩토링/정리/구조 개선/refactor/clean up.'
---

# refactor (code-agent)

Follow `../../harness-library/code-quality-policy.md` for comments and names.

Behavior is immutable. Add no tests. The existing suite is the safety proof.

1. Confirm the full existing suite is green before editing. If not, stop and use bugfix first.
2. Load structure with `sugo_get_project_context` and `sugo_explore`.
3. Improve internals without changing any public contract.
4. Run the same suite and confirm it stays green. A new test means this is a feature change, not a refactor.
5. If needed, use `sugo_chain` to ask test-agent for regression verification only.

success: Structure improved, the suite stayed green, and public behavior is unchanged.
on_failure: If behavior changed, stop treating the work as a refactor; switch to feat or bugfix.
