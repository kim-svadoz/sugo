import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { collectDescendantTaskIds, extractPrRefs, resolveRefs } from "../src/services/prService.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { syncCanvas, syncUser } from "../src/services/syncService.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");

describe("extractPrRefs", () => {
  it("extracts a valid prRefs blob, defaulting targetBranch to develop", () => {
    const json = JSON.stringify({ prRefs: { baseUrl: "https://bb", projectKey: "P", repoSlug: "r", sourceBranch: "feat/x" } });
    expect(extractPrRefs(json)).toEqual({
      baseUrl: "https://bb",
      projectKey: "P",
      repoSlug: "r",
      sourceBranch: "feat/x",
      targetBranch: "develop",
    });
  });

  it("returns null when work_result is null/missing/malformed", () => {
    expect(extractPrRefs(null)).toBeNull();
    expect(extractPrRefs("{}")).toBeNull();
    expect(extractPrRefs("not json")).toBeNull();
    expect(extractPrRefs(JSON.stringify({ prRefs: { baseUrl: "x" } }))).toBeNull(); // missing fields
  });
});

describe("collectDescendantTaskIds", () => {
  it("collects only task-level descendants, walking through intermediate workstreams", () => {
    const nodes = [
      { id: "spec1", level: "spec", parent: null, work_result: null },
      { id: "ws1", level: "workstream", parent: "spec1", work_result: null },
      { id: "t1", level: "task", parent: "ws1", work_result: null },
      { id: "t2", level: "task", parent: "ws1", work_result: null },
      { id: "other", level: "task", parent: null, work_result: null },
    ];
    expect(collectDescendantTaskIds(nodes, "spec1").sort()).toEqual(["t1", "t2"]);
    expect(collectDescendantTaskIds(nodes, "ws1").sort()).toEqual(["t1", "t2"]);
    expect(collectDescendantTaskIds(nodes, "other")).toEqual([]);
  });
});

describe("resolveRefs — §6 scope 선택 PR", () => {
  async function seeded() {
    const db = createSqliteClient();
    await db.execScript(schema);
    await syncUser(db, { userId: "u1" });
    return db;
  }

  it("task scope: 자기 자신의 prRefs만 본다", async () => {
    const db = await seeded();
    await syncCanvas(db, "u1", "ws1", [
      {
        id: "t1",
        title: "T1",
        level: "task",
        status: "done",
        workResult: { prRefs: { baseUrl: "https://bb", projectKey: "P", repoSlug: "r", sourceBranch: "feat/t1" } },
      },
    ]);
    const result = await resolveRefs(db, "u1", "ws1", "t1", "task");
    expect(result).toEqual({
      ok: true,
      ref: { baseUrl: "https://bb", projectKey: "P", repoSlug: "r", sourceBranch: "feat/t1", targetBranch: "develop" },
    });
  });

  it("반드시 거부: prRefs가 하나도 없으면 NO_REFS", async () => {
    const db = await seeded();
    await syncCanvas(db, "u1", "ws1", [{ id: "t1", title: "T1", level: "task", status: "pending" }]);
    const result = await resolveRefs(db, "u1", "ws1", "t1", "task");
    expect(result).toEqual({ ok: false, error: "NO_REFS" });
  });

  it("run scope: 하위 task들의 branch가 전부 같으면 단일 ref로 통과", async () => {
    const db = await seeded();
    await syncCanvas(db, "u1", "ws1", [
      { id: "run1", title: "Run", level: "workstream", status: "in_progress" },
      {
        id: "t1",
        title: "T1",
        level: "task",
        status: "done",
        parent: "run1",
        workResult: { prRefs: { baseUrl: "https://bb", projectKey: "P", repoSlug: "r", sourceBranch: "feat/shared" } },
      },
      {
        id: "t2",
        title: "T2",
        level: "task",
        status: "done",
        parent: "run1",
        workResult: { prRefs: { baseUrl: "https://bb", projectKey: "P", repoSlug: "r", sourceBranch: "feat/shared" } },
      },
    ]);
    const result = await resolveRefs(db, "u1", "ws1", "run1", "run");
    expect(result.ok).toBe(true);
  });

  it("반드시 거부: run scope인데 하위 task들 branch가 다르면 MULTI_BRANCH", async () => {
    const db = await seeded();
    await syncCanvas(db, "u1", "ws1", [
      { id: "run1", title: "Run", level: "workstream", status: "in_progress" },
      {
        id: "t1",
        title: "T1",
        level: "task",
        status: "done",
        parent: "run1",
        workResult: { prRefs: { baseUrl: "https://bb", projectKey: "P", repoSlug: "r", sourceBranch: "feat/a" } },
      },
      {
        id: "t2",
        title: "T2",
        level: "task",
        status: "done",
        parent: "run1",
        workResult: { prRefs: { baseUrl: "https://bb", projectKey: "P", repoSlug: "r", sourceBranch: "feat/b" } },
      },
    ]);
    const result = await resolveRefs(db, "u1", "ws1", "run1", "run");
    expect(result).toEqual({ ok: false, error: "MULTI_BRANCH" });
  });
});
