---
description: 'Discard retained data after reinstall and start a new Sugo environment.'
---

1. Explain that workspaces and sessions in `~/.sugo/data` will be permanently deleted and cannot be recovered.
2. Require the exact input `DELETE_RETAINED_DATA`; otherwise stop.
3. Call `sugo_uninstall(action: "discard", confirmation: "DELETE_RETAINED_DATA")`.
4. Then run `sugo_add` for the project selected by the user. Do not register it before discard completes.
