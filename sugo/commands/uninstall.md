---
description: 'Remove project links and automatic rules, retain user data inactive, then uninstall the plugin.'
argument-hint: ""
---

Uninstall Sugo safely. Keep this order because some operations are irreversible.

1. Call `sugo_uninstall(action: "preview", mode: "retain")`.
2. Explain that automatic project rules will be removed, the local dashboard server will be stopped, and data retained inactive in `~/.sugo/data`. Require the exact input `UNINSTALL_SUGO`.
3. Call `sugo_uninstall(action: "execute", mode: "retain", confirmation: "UNINSTALL_SUGO")`.
4. Require `verifiedClean: true`. Report every `preserved` path; ownership was not proven, so it was intentionally kept.
5. Only then run `claude plugin uninstall sugo@sugo-marketplace --scope user`. If it fails, distinguish completed data cleanup from failed plugin-cache removal.

Rules:
- Use `/sugo:purge` for permanent deletion.
- If the cache disappeared first, use `node ~/.sugo/bin/sugo-uninstall.mjs uninstall` for the same unlink operation.
- Never infer ownership from a name or location. Only files recorded in the install manifest are Sugo-owned.
- Preserve existing `CLAUDE.md`, `AGENTS.md`, and user `.claude/rules/**`.
