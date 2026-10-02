# Roadmap sync size and failure contract — 2026-10-02

Plugin 0.18.1 / Console 0.11.1 fixes roadmap sync failing at Express's default 100KB JSON limit.

## Payload ownership and bound

`POST /api/sync/roadmap` remains a complete workspace snapshot. Backend `syncRoadmap` diffs IDs and
deletes nodes absent from the snapshot while preserving Dashboard-owned ordering and manual fields.
Sending only changed nodes through this endpoint would delete unchanged nodes. A future incremental
endpoint needs explicit upsert/delete operations, revision ordering and retry/idempotency rules; it is
not interchangeable with the current snapshot contract.

Each TASK keeps its latest report, state, runtime assessment and work-result summary. Its `files`
contains only `path`, `change`, and additions/deletions when a unified diff is available. Binary files
or records without diff omit line counts. Patch lineage and SPEC/RUN keep only work-result path,
timing/model, summary, patch metadata, verification summary and PR references; no file snapshots or
full report arrays. Historical requirements and changed-path lists remain on the lineage entry.
Local work-result artifacts and stored source snapshots are not modified.

The wire compaction is idempotent and also runs before old queued roadmap snapshots are resent.
The complete JSON request, including schemaVersion, is capped at **1MiB (1,048,576 UTF-8 bytes)** by
the plugin. This is a hard rejection, never truncation or omission of nodes. A larger snapshot is
retained as `permanent_failure` with `ROADMAP_PAYLOAD_TOO_LARGE (limit 1MiB)` and is not sent.
Metadata can still grow with task count or large user summaries; the bound makes that visible rather
than silently losing sync. The real-browser 30-task fixture shrank to **23,872 bytes** from source
snapshots containing 100,000 Korean characters per task. The compact snapshot round-trips through
the authenticated API with `done`/`DONE`, summary and changed paths intact.

Console's JSON parser limit is **10mb (10MiB)**. Parser `entity.too.large` produces HTTP 413 with
`{error:"payload_too_large",message:"JSON request body exceeds the 10mb limit.",limit:"10mb"}`.
An upstream proxy can enforce its own lower limit; the plugin treats its 413 the same way.

## Failure queue and diagnostics

Items retain `lastHttpStatus`, `lastFailureReason`, `lastFailureAt` and status. HTTP 400/404/405/410/
413/415/422 are permanent request failures. They stay in the queue without spending retry attempts
and automatic drains skip them. Network errors/timeouts, 401/403 (credentials may change), 408/429
and server errors remain retryable; a successful send removes the item. Reasons use HTTP status or
a fixed transport error, never server response bodies or tokens.

Retryable items are discarded after five failed drain attempts. Queue capacity remains 100 items;
capacity eviction also applies to permanent items. Every discard emits a stderr warning and updates
durable `discardedCount`/`discardedReasons` in the queue file. `sugo_status(health:true)` reports the
post-drain `permanentFailureCount`, cumulative `discardedCount` and aggregated `failureReasons`.
Older queue files lacking these fields are supported. Discards before this release cannot be counted
retroactively.

Resolve the reported server/endpoint/size issue, then sync the workspace's current snapshot again.
Permanent items do not automatically resume. After verifying the fresh sync, back up the queue before
removing obsolete permanent records; retain cumulative discard diagnostics. Never resend a stale
snapshot after newer work has completed.

## Rollout and file viewing

- Update Plugin to 0.18.1 (`claude plugin update sugo@sugo-marketplace`, then `/reload-plugins`).
- Deploy Console 0.11.1 and **restart the backend**: changing parser configuration in source/build
  does not change an already running process. Rebuild/deploy frontend too for the Console version badge.
- Source content and diffs are no longer sent to Console. Existing file viewer displays paths and its
  existing “no saved diff/content” notice; task status, phase, summary and patch-entry paths remain.
  No on-demand source endpoint is added in this release. Source contents remain in local artifacts;
  a future viewer endpoint must retrieve them only on request rather than putting them in snapshots.
- The manual 2026-10-02 repair removed content/diff from two queued orders snapshots
  (186KB → 62KB). Its backup is `sync-retry-queue.backup-20261002.json`; ranking-rank/favorite-items's
  removed source previews are not restored by this release.

Validation: Plugin 103 files / 1,136 tests; Console backend 46 files / 356 tests; frontend 25 files /
69 tests; all builds/typechecks and Plugin cold-smoke 42 cases passed. HTTP 190KB routing, over-10MiB
413, permanent-failure health, retry exhaustion/capacity and UTF-8 size bound are covered. Browser QA
uses `dashboard/e2e/roadmap-payload-flow.mjs` with a real isolated SQLite API and Edge. MySQL was not
available in this environment; this release changes neither SQL nor the database schema.
