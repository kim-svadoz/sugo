---
description: 'Explicitly restore retained Sugo data and project links after reinstall.'
---

Call `sugo_uninstall(action: "restore")` only after the user explicitly requests recovery.
Reinstallation alone must not restore data or modify project files.
Restore stops any dashboard server that the reinstall already started, replaces the data, and starts the dashboard again. Report `dashboard` from the result.
