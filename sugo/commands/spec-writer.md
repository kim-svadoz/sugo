---
description: 'Convert a Schedule SPEC draft into an implementable spec.md and link it to Dashboard. Claude and Codex share this contract.'
argument-hint: --workspace <name> --project <absolute-path> --spec-draft <id>
---

Read and follow the `spec-writer` skill exactly.

If context returns `SPEC_REFERENCED_SOURCE_MISSING`, stop and ask for the referenced planning material. Never replace a missing source with a summary or an assumption.

Input: $ARGUMENTS

First call `sugo_spec_writer(action:"context")` to verify editability and select the exact Schedule SPEC. Load project context with `sugo_get_project_context`.
After writing and validating spec.md, call `sugo_spec_writer(action:"complete")` and link its absolute path to the same SPEC card. Do not implement the product or start feat.
Write a product-level specification. Exclude file paths, line numbers, current implementation details, and research assumptions. If complete returns `SPEC_LINT_WARNINGS`, do not use `acceptLintWarnings:true` without user approval.
Copy every planning image from `attachments` into the spec version's `images/` directory and use relative links in spec.md.
Follow the skill's file rules; the destination is outside the project repository. Open Questions may contain only decisions that change behavior or completion criteria, not ownership, schedule, or coordination.
