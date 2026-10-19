---
name: gate-philosophy
description: 'Sugo gate policy. Passing requires behavioral evidence, not proxies. Bypass only with explicit labels. Applies whenever an agent handles gates or unavailable environments.'
---

# Gate philosophy (GATE_PHILOSOPHY)

Gates permit state transitions only from execution evidence, never self-report. Do not weaken this rule.

## Principles

1. A gate proves behavior. Green tests and static checks are proxies, not behavioral proof. Bypass only with an explicit unverified label.
2. Enforce order. The server blocks skipped state-machine prerequisites and does not trust the client.
3. Do not trust self-report. The server cross-checks claims against execution evidence and rejects contradictory unavailable-environment labels.
4. Use labels for compatibility. New gates are opt-in or conditional where specified. A label can avoid deadlock, but excessive labels reduce the completion grade.

## Practice

- When blocked, satisfy the gate. Run the test, add the real wiring test, and execute the full verification command.
- An unavailable build environment is a valid escape only when true. Existing green evidence in the same session makes that label contradictory.
- Fail closed when a claim omits results, green lacks evidence, stored evidence failed, or an unverified claim conflicts with green evidence.
