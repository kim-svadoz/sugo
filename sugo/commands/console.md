---
description: Check, start, restart, stop, or open the local Sugo Console.
argument-hint: "[status|start|restart|stop|open]"
---

Manage the local Sugo Console. Input: $ARGUMENTS

## Procedure
- Treat an empty argument as `status`.
- Accept only `status`, `start`, `restart`, `stop`, or `open`.
- Call `sugo_console(action)` with the selected action.
- Report whether the Console is running, its URL from the result (`http://sugo.localhost:<port>`), Console version, and Plugin build. The port is 3001 by default but moves to the next free port when 3001 is taken, so always quote the returned `url` instead of assuming 3001.
- `open` starts the Console if needed and opens the returned URL in the default browser. If the result has a `message` saying the browser could not be opened, give the user the URL.
- For `start` or `restart`, tell the user to open the returned URL only after `running:true`.
- If `managed:false` while a server is running, explain that the port is occupied by a Console process not started by this plugin and do not stop it.

The installed Console starts automatically on a new Claude Code session. `/reload-plugins` reloads plugin definitions but does not rerun the `SessionStart` hook; use this command when the current session needs explicit recovery.
