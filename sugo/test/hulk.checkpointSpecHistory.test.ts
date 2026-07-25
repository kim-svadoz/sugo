import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addCheckpoint, listCheckpoints } from "../src/hulk/checkpoint.js";
import { addWorkLog, getWorkLog, listWorkLogs } from "../src/hulk/history.js";
import { checkpointApplies } from "../src/hulk/matching.js";
import { appendMemory, readMemory } from "../src/hulk/memory.js";
import { addSpec, getSpec, listSpecs } from "../src/hulk/spec.js";

let fakeHome: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-hulk2-home-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
});

afterEach(() => {
  delete process.env.SUGO_HOME_OVERRIDE;
  rmSync(fakeHome, { recursive: true, force: true });
});

describe("Checkpoint CRUD", () => {
  it("addCheckpoint 후 listCheckpoints로 다시 읽으면 동일하다", async () => {
    const cp = await addCheckpoint("team-a", {
      title: "보안 체크",
      category: "security",
      applies_to: ["lang/typescript"],
      checklist: ["비밀키 하드코딩 없음", "입력 검증 있음"],
    });
    const list = await listCheckpoints("team-a");
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(cp.id);
    expect(list[0].checklist).toEqual(["비밀키 하드코딩 없음", "입력 검증 있음"]);
  });

  it("워크스페이스에 체크포인트가 없으면 빈 배열", async () => {
    expect(await listCheckpoints("empty-ws")).toEqual([]);
  });
});

describe("checkpointApplies", () => {
  it("applies_to가 비어있으면 항상 적용된다", () => {
    expect(checkpointApplies({ applies_to: [] }, { projectName: "demo", harnessIds: [] })).toBe(true);
    expect(checkpointApplies({}, { projectName: "demo", harnessIds: [] })).toBe(true);
  });

  it("프로젝트명이 일치하면 적용된다", () => {
    expect(checkpointApplies({ applies_to: ["demo"] }, { projectName: "demo", harnessIds: [] })).toBe(true);
  });

  it("harnessId가 일치하면 적용된다", () => {
    expect(
      checkpointApplies({ applies_to: ["lang/typescript"] }, { projectName: "demo", harnessIds: ["lang/typescript"] }),
    ).toBe(true);
  });

  it("아무것도 일치하지 않으면 적용되지 않는다", () => {
    expect(
      checkpointApplies({ applies_to: ["framework/spring"] }, { projectName: "demo", harnessIds: ["lang/typescript"] }),
    ).toBe(false);
  });
});

describe("Spec CRUD", () => {
  it("addSpec 후 getSpec으로 content까지 정확히 복원한다", async () => {
    await addSpec("team-a", {
      name: "인증 아키텍처",
      type: "architecture",
      tags: ["auth"],
      content: "# 인증 흐름\n\n1. 로그인\n2. 토큰 발급",
    });
    const spec = await getSpec("team-a", "인증 아키텍처");
    expect(spec?.type).toBe("architecture");
    expect(spec?.content).toBe("# 인증 흐름\n\n1. 로그인\n2. 토큰 발급");
  });

  it("listSpecs는 저장된 모든 스펙을 반환한다", async () => {
    await addSpec("team-a", { name: "A", type: "api-design", content: "x" });
    await addSpec("team-a", { name: "B", type: "data-model", content: "y" });
    expect((await listSpecs("team-a")).length).toBe(2);
  });

  it("없는 스펙은 null", async () => {
    expect(await getSpec("team-a", "없음")).toBeNull();
  });
});

describe("WorkLog(History)", () => {
  it("addWorkLog 후 getWorkLog로 조회된다", async () => {
    const log = await addWorkLog("team-a", {
      task_id: "task-1",
      task_title: "로그인 구현",
      completed_at: new Date().toISOString(),
      summary: "완료",
      metrics: { estimatedHumanHours: 1.5, aiExecutionMinutes: 20 },
    });
    const fetched = await getWorkLog("team-a", log.id);
    expect(fetched?.metrics?.estimatedHumanHours).toBe(1.5);
  });

  it("listWorkLogs는 완료시각순으로 정렬한다", async () => {
    await addWorkLog("team-a", { task_id: "t1", task_title: "A", completed_at: "2026-01-02T00:00:00.000Z" });
    await addWorkLog("team-a", { task_id: "t2", task_title: "B", completed_at: "2026-01-01T00:00:00.000Z" });
    const logs = await listWorkLogs("team-a");
    expect(logs.map((l) => l.task_id)).toEqual(["t2", "t1"]);
  });
});

describe("memory.md", () => {
  it("appendMemory로 누적하고 readMemory로 전체를 읽는다", async () => {
    await appendMemory("team-a", "첫 메모");
    await appendMemory("team-a", "두번째 메모");
    const content = await readMemory("team-a");
    expect(content).toContain("첫 메모");
    expect(content).toContain("두번째 메모");
  });

  it("메모가 없으면 빈 문자열", async () => {
    expect(await readMemory("empty-ws")).toBe("");
  });
});
