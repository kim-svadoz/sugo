---
description: 'Permanently delete Sugo project links, user data, and the standalone uninstaller.'
---

1. Show targets with `sugo_uninstall(action: "preview", mode: "purge")`.
2. Explain that purge is irreversible, stops the local dashboard server, and deletes its data. Require the exact input `DELETE_SUGO_DATA`.
3. Call `sugo_uninstall(action: "execute", mode: "purge", confirmation: "DELETE_SUGO_DATA")`.
4. Only after `verifiedClean: true`, run `claude plugin uninstall sugo@sugo-marketplace --scope user`.

If the plugin cache is already absent, use `node ~/.sugo/bin/sugo-uninstall.mjs purge`.
