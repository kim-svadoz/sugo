---
description: Read the installed Sugo plugin version and verify that an update is active. Read-only.
---

Read the installed Sugo version.

## Procedure
- Call `sugo_version()` and show the result.
- The value is the build-time constant `__SUGO_VERSION__` from the running bundle, not the repository `package.json`. It proves which installation is active.
- If it differs from the expected version, run `claude plugin update sugo@sugo-marketplace`, then `/reload-plugins`. Reload reconnects the MCP server; a full Claude Code restart is unnecessary even if plugin update prints `Restart to apply changes.`
- If the version did not change, inspect repository `package.json` first. Plugin update skips content changes under the same version as `already at the latest version`. A version bump without a rebuild also leaves the old bundle constant.
- `updateCheckAvailable:false` means remote update checking is unavailable. Compare the installed value with the repository directly.

Read-only. Do not change state.
