import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { serializeRoadmapSnapshot, compactRoadmapPayload } from "../src/dashboard/serialize.js";
import { pushEvent, drainRetryQueue, classifyHttpFailure } from "../src/dashboard/client.js";
import { listRetryQueue, enqueueRetry, processRetryQueue, retryQueueHealth } from "../src/dashboard/retryQueue.js";
import { handleSugoStatus } from "../src/tools/sugoStatus.js";
import type { RoadmapNode } from "../src/hulk/types.js";

let home: string | undefined;
afterEach(() => {
  delete process.env.SUGO_HOME_OVERRIDE;
  delete process.env.SUGO_DASHBOARD_API_URL;
  if (home) rmSync(home, { recursive: true, force: true });
});

it("30 completed tasks strip snapshots without losing state, summary, patch paths or verification reasons", () => {
  const bypassLabels = [{ kind: "runtimeUnverified", reason: "실서버 확인 필요", patchVersion: 0, recordedAt: "2026-10-08T00:00:00Z" }];
  const result = { path: "/work/result.md", summary: "완료 요약", report: { schemaVersion: 1 as const, featureName: "완료", kind: "feat" as const, patchVersion: 0, completedAt: "2026-10-08T00:01:00Z", completionGrade: "unverified" as const, summary: "완료 요약", verification: { test: { state: "pass" as const }, runtimeVerified: false }, changedFiles: [], requirements: [], designDecisions: [], knownLimitations: [], bypassLabels }, files: [{ path: "a.ts", change: "modified" as const, content: "한".repeat(100_000), diff: "+added\n-removed\n" }] };
  const nodes: RoadmapNode[] = Array.from({ length: 30 }, (_, i) => ({ id: `task-${i}`, title: "완료", level: "task", status: "done", dependsOn: [], workResult: result, lineage: [{ version: 0, completedAt: "2026-10-02", summary: result.summary, workResult: result }] }));
  nodes.push({ id: "run-001", title: "RUN", level: "workstream", status: "done", dependsOn: [], workResult: result });
  const original = JSON.stringify(nodes);
  const payload = serializeRoadmapSnapshot("u", "ws", nodes);
  expect(Buffer.byteLength(JSON.stringify(payload))).toBeLessThan(1024 * 1024);
  const task = payload.nodes[0].workResult as typeof result;
  expect(task.summary).toBe("완료 요약");
  expect(task.files[0]).toEqual({ path: "a.ts", change: "modified", additions: 1, deletions: 1 });
  expect(payload.nodes[0].status).toBe("done");
  const lineage = payload.nodes[0].lineage as { workResult: Record<string, unknown> }[];
  expect(lineage[0].workResult).toMatchObject({ path: result.path, summary: result.summary });
  expect(lineage[0].workResult).toMatchObject({ report: { bypassLabels } });
  expect(lineage[0].workResult.files).toBeUndefined();
  expect((payload.nodes[30].workResult as Record<string, unknown>).files).toBeUndefined();
  expect(JSON.stringify(nodes)).toBe(original);
  expect(compactRoadmapPayload(payload)).toEqual(payload);
});

it("HTTP 413 stays permanent without spending retries and health reports the reason", async () => {
  home = mkdtempSync(join(tmpdir(), "sugo-413-"));
  process.env.SUGO_HOME_OVERRIDE = home;
  let requests = 0;
  const server = createServer((req, res) => {
    req.resume();
    req.on("end", () => { requests++; res.writeHead(413); res.end('PAYLOAD_TOO_LARGE'); });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.SUGO_DASHBOARD_API_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    await pushEvent("/api/sync/roadmap", "POST", { nodes: [] });
    for (let i = 0; i < 6; i++) await drainRetryQueue();
    expect(requests).toBe(1);
    expect((await listRetryQueue())[0]).toMatchObject({ retryCount: 0, status: "permanent_failure", lastHttpStatus: 413, lastFailureReason: "HTTP 413" });
    const health = JSON.parse((await handleSugoStatus({ health: true })).content[0].text).health;
    expect(health.permanentFailureCount).toBe(1);
    expect(health.failureReasons).toContainEqual(expect.objectContaining({ reason: "HTTP 413", count: 1 }));
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

it("local 1MiB bound rejects without sending or consuming retries", async () => {
  home = mkdtempSync(join(tmpdir(), "sugo-size-bound-"));
  process.env.SUGO_HOME_OVERRIDE = home;
  process.env.SUGO_DASHBOARD_API_URL = "http://127.0.0.1:1";
  await pushEvent("/api/sync/roadmap", "POST", { nodes: [{ id: "t", level: "task", title: "한".repeat(400_000) }] });
  await drainRetryQueue();
  expect((await listRetryQueue())[0]).toMatchObject({ status: "permanent_failure", retryCount: 0, lastFailureReason: "ROADMAP_PAYLOAD_TOO_LARGE (limit 1MiB)" });
});

it("retry exhaustion and capacity eviction leave durable health diagnostics", async () => {
  home = mkdtempSync(join(tmpdir(), "sugo-discard-"));
  process.env.SUGO_HOME_OVERRIDE = home;
  await enqueueRetry("/api/sync/task", "POST", {}, classifyHttpFailure(503));
  for (let i = 0; i < 5; i++) await processRetryQueue(async () => classifyHttpFailure(503));
  expect(await listRetryQueue()).toHaveLength(0);
  expect(await retryQueueHealth()).toMatchObject({ discardedCount: 1, failureReasons: [{ reason: "retry attempts exhausted: HTTP 503", count: 1 }] });
  for (let i = 0; i < 101; i++) await enqueueRetry("/api/sync/task", "POST", { id: i }, classifyHttpFailure(413));
  const health = await retryQueueHealth();
  expect(health.discardedCount).toBe(2);
  expect(health.permanentFailureCount).toBe(100);
  expect(health.failureReasons).toContainEqual({ reason: "queue capacity exceeded: HTTP 413", count: 1 });
});

it("permanent failures discovered while draining keep the existing retry count", async () => {
  home = mkdtempSync(join(tmpdir(), "sugo-retry-classify-"));
  process.env.SUGO_HOME_OVERRIDE = home;
  await enqueueRetry("/api/sync/task", "POST", {});
  await processRetryQueue(async () => classifyHttpFailure(503));
  await processRetryQueue(async () => classifyHttpFailure(413));
  expect((await listRetryQueue())[0]).toMatchObject({ retryCount: 1, lastHttpStatus: 413, status: "permanent_failure" });
});
