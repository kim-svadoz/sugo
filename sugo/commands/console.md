---
description: Check, start, restart, or stop the local Sugo Console.
argument-hint: "[status|start|restart|stop]"
---

Manage the local Sugo Console. Input: $ARGUMENTS

## Procedure
- Treat an empty argument as `status`.
- Accept only `status`, `start`, `restart`, or `stop`.
- Call `sugo_console(action)` with the selected action.
- Report whether the Console is running, its fixed local URL, Console version, and Plugin build.
- For `start` or `restart`, tell the user to open the returned URL only after `running:true`.
- If `managed:false` while a server is running, explain that the port is occupied by a Console process not started by this plugin and do not stop it.

The installed Console starts automatically on a new Claude Code session. `/reload-plugins` reloads plugin definitions but does not rerun the `SessionStart` hook; use this command when the current session needs explicit recovery.
