---
description: 'Register a project with Sugo: detect stack, fetch and compose harnesses, then register project and workspace.'
argument-hint: "[projectPath] [workspace]"
---

Register a project with Sugo. Input: $ARGUMENTS

## Procedure
1. Call `sugo_add(projectPath, workspace?, repoUrl?, additionalStacks?)`.
   - StackDetector inspects build.gradle, pom.xml, package.json, dependencies, and application*.yml. It detects languages, frameworks, build tools, and data stores, then returns harnessIds and commands.
   - HarnessFetcher gets harnesses. External use falls back to local harnesses and does not block when the repository is unavailable.
   - HarnessComposer writes the summary index `sugo/CLAUDE.md`, each `sugo/harness/<id>/{harness.md,validation.yaml}`, `sugo/config.json`, and the registry.
   - `.claude/rules/<id>.md` is the automatic-load path. Claude Code discovers it recursively at session start, even without `sugo_get_project_context`. Add `paths:` frontmatter per harness so unrelated work does not load it; a harness without globs, such as default, always loads. Add a managed block to root `CLAUDE.md` without replacing user content. WORK is always enabled, so also register the workspace.
2. Summarize detected stacks, applied harnesses, and warnings, including default fallback for an unavailable requested harness.

## Rules
- Use `sugo_update` to redetect an existing project. Use add only for new registration.
- `writeClaudeIfChanged` must skip timestamp-only rewrites to avoid a dirty worktree.
