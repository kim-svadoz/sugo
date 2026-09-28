import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { syncRemoteCheckpointsToRules } from "../src/hulk/checkpoint.js";

describe("dashboard checkpoint expiry reconciliation", () => {
  it("유효한 체크포인트만 쓰고 다음 날에는 기존 관리 파일을 제거한다", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "sugo-cp-expiry-"));
    const checkpoint = {
      id: "CP-remote",
      title: "기간 한정 규칙",
      category: "general",
      checklist: ["확인"],
      expires_at: "2026-10-02",
    };

    const active = await syncRemoteCheckpointsToRules(projectPath, "payments", [checkpoint], {
      projectName: "checkout-api",
      harnessIds: [],
    }, new Date("2026-10-02T00:00:00.000Z"));
    expect(active.appliedCount).toBe(1);
    const file = join(projectPath, ".claude", "rules", "general", "CP-remote-기간-한정-규칙.md");
    expect(await readFile(file, "utf8")).toContain("expires-at: 2026-10-02");

    const expired = await syncRemoteCheckpointsToRules(projectPath, "payments", [checkpoint], {
      projectName: "checkout-api",
      harnessIds: [],
    }, new Date("2026-10-02T15:00:00.000Z"));
    expect(expired.appliedCount).toBe(0);
    expect(expired.removedCount).toBe(1);
    await expect(access(file)).rejects.toThrow();
  });

  it("직접 수정된 파일은 만료돼도 보존하고 충돌을 반환한다", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "sugo-cp-expiry-conflict-"));
    const checkpoint = {
      id: "CP-remote",
      title: "기간 한정 규칙",
      category: "general",
      checklist: ["확인"],
      expires_at: "2026-10-02",
    };
    await syncRemoteCheckpointsToRules(projectPath, "payments", [checkpoint], {
      projectName: "checkout-api",
      harnessIds: [],
    }, new Date("2026-10-02T00:00:00.000Z"));
    const file = join(projectPath, ".claude", "rules", "general", "CP-remote-기간-한정-규칙.md");
    await writeFile(file, `${await readFile(file, "utf8")}\n직접 수정\n`);

    const expired = await syncRemoteCheckpointsToRules(projectPath, "payments", [checkpoint], {
      projectName: "checkout-api",
      harnessIds: [],
    }, new Date("2026-10-02T15:00:00.000Z"));
    expect(expired.removedCount).toBe(0);
    expect(expired.conflicts).toEqual([file]);
    expect(await readFile(file, "utf8")).toContain("직접 수정");
  });

  it("0.6.1이 만든 hash 없는 원문 파일은 정확히 일치할 때만 만료 정리한다", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "sugo-cp-expiry-legacy-"));
    const dir = join(projectPath, ".claude", "rules", "general");
    await mkdir(dir, { recursive: true });
    const file = join(dir, "CP-legacy-구형-규칙.md");
    await writeFile(file, [
      "---",
      'description: "Sugo checkpoint CP-legacy · payments"',
      "---",
      "",
      "# 구형 규칙",
      "",
      "> payments 도메인의 재발방지 컨텍스트 · 도메인 전체 적용",
      "",
      "- 확인",
    ].join("\n"));

    const result = await syncRemoteCheckpointsToRules(projectPath, "payments", [{
      id: "CP-legacy", title: "구형 규칙", category: "general", checklist: ["확인"], expires_at: "2000-01-01",
    }], { projectName: "", harnessIds: [] });

    expect(result.removedCount).toBe(1);
    expect(result.conflicts).toEqual([]);
    await expect(access(file)).rejects.toThrow();
  });
});
