---
description: Scan the project with tree-sitter AST and return onboarding JSON. Do not use regex parsing.
argument-hint: "[projectPath]"
---

Inspect project structure. Input: $ARGUMENTS

## Procedure
- Call `sugo_overview(projectPath)`. It walks up to 200 files and returns classes, methods, and structure from the tree-sitter AST, not regex matches.
- Use `sugo_explore(files)` for a focused file inspection before code-agent edits.

This command is read-only.
