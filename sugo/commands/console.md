---
description: Manage the local Sugo Console server and its independently installed runtime.
argument-hint: "[status|start|restart|stop|open|runtime_status|runtime_update|runtime_rollback]"
---

Manage the local Sugo Console. Input: $ARGUMENTS

## Procedure
- Treat an empty argument as `status`.
- Accept `status`, `start`, `restart`, `stop`, `open`, `runtime_status`, `runtime_update`, or `runtime_rollback`.
- Use `runtime_install` only when the user supplies a local runtime directory, then pass it as `runtimePath`.
- Call `sugo_console(action)` with the selected action.
- Report whether the Console is running, its URL from the result (`http://sugo.localhost:<port>`), Console version, and Plugin build. The port is 3001 by default but moves to the next free port when 3001 is taken, so always quote the returned `url` instead of assuming 3001.
- `open` starts the Console if needed and opens the returned URL in the default browser. If the result has a `message` saying the browser could not be opened, give the user the URL.
- For `start` or `restart`, tell the user to open the returned URL only after `running:true`.
- If `managed:false` while a server is running, explain that the port is occupied by a Console process not started by this plugin and do not stop it.
- `runtime_status` reports the active source and installed versions. `runtime_update` downloads and verifies the newest compatible Console release. `runtime_rollback` selects the previous compatible runtime and pins it until an explicit update.

The Console does not start with each session. It starts with `open` or `start`, and on its own when a task waits for a human decision. Records made while it was off are synced when it starts. Compatible runtimes are installed under `~/.sugo/runtime/console/`; the embedded runtime remains a fallback.
