---
description: Build the weekly work report and technical learning notes for one week now. Without arguments, Fri-Sun builds this week and Mon-Thu builds last week.
argument-hint: "[2026-W42] [--force] [--render-only]"
---

Build the weekly report. Input: $ARGUMENTS

## Procedure
1. Run `node "${CLAUDE_PLUGIN_ROOT}/weekly/run.mjs" build $ARGUMENTS`. It takes a few minutes (two Claude calls).
2. Report the last line: HTML path, topic count, technology count, topics without evidence, commits not in any topic, cost.
3. If the Console is running, the engine sends the report to the Console Weekly screen. If the Console is off, the local HTML in `~/.weekly/reports/` is still written.

## Rules
- The engine needs Python 3.12 or later. If `run.mjs` reports that Python is missing, tell the user to install it. Do not install it yourself.
- The engine does not call Claude again when the records did not change. Use `--force` to build again, or `--render-only` to redraw the page only.
- Do not edit report sentences directly. Put corrections in `~/.weekly/reports/<week>.edits.json`.
- The schedule, model, and extra repositories are set in Console Preferences. This command does not change them.
