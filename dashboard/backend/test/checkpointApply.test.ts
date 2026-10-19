import { access, mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { applyCheckpointToProjects, isCheckpointExpired, newCheckpointId } from "../src/services/checkpointApply.js";

describe("checkpoint save-and-apply", () => {
  it("대상 프로젝트의 category 폴더에 관리 파일을 만든다", async () => {
    const root = await mkdtemp(join(tmpdir(), "sugo-cp-"));
    await mkdir(join(root, "sugo"), { recursive: true });
    await writeFile(join(root, "sugo", "config.json"), JSON.stringify({
      projectName: "checkout-api",
      detectedStack: { harnessIds: ["lang-java-21"] },
    }));

    const result = await applyCheckpointToProjects({
      workspace: "payments",
      checkpoint: { id: "CP-abcd1234", title: "결제 중복 방지", category: "business", appliesTo: ["lang-java-21"], checklist: ["멱등키를 확인한다"] },
      projectPaths: [root],
    });

    expect(result.applied).toHaveLength(1);
    const content = await readFile(result.applied[0].file, "utf8");
    expect(content).toContain("sugo-managed: checkpoint");
    expect(content).toContain("멱등키를 확인한다");
  });

  it("생성된 rules 파일을 직접 고쳤으면 덮어쓰지 않고 충돌로 남긴다", async () => {
    const root = await mkdtemp(join(tmpdir(), "sugo-cp-conflict-"));
    const input = {
      workspace: "payments",
      checkpoint: { id: "CP-abcd1234", title: "결제 중복 방지", category: "general", appliesTo: [], checklist: ["첫 규칙"] },
      projectPaths: [root],
    };
    const first = await applyCheckpointToProjects(input);
    await writeFile(first.applied[0].file, `${await readFile(first.applied[0].file, "utf8")}\n직접 수정\n`);

    const second = await applyCheckpointToProjects({ ...input, checkpoint: { ...input.checkpoint, checklist: ["바뀐 규칙"] } });
    expect(second.conflicts).toEqual([expect.objectContaining({ projectPath: root })]);
    expect(await readFile(first.applied[0].file, "utf8")).toContain("직접 수정");
  });

  it("사람이 입력하지 않아도 충돌 가능성이 낮은 ID를 만든다", () => {
    expect(newCheckpointId()).toMatch(/^CP-[0-9a-f]{8}$/);
  });

  it("Markdown 원문을 그대로 적용하고 같은 내용의 재적용은 변경으로 세지 않는다", async () => {
    const root = await mkdtemp(join(tmpdir(), "sugo-cp-md-"));
    const input = {
      workspace: "payments",
      checkpoint: { id: "CP-md123456", title: "운영 규칙", category: "general", appliesTo: [], learnedFrom: "## 확인\n\n- 첫 번째\n- 두 번째" },
      projectPaths: [root],
    };
    const first = await applyCheckpointToProjects(input);
    const second = await applyCheckpointToProjects(input);
    expect(await readFile(first.applied[0].file, "utf8")).toContain("## 확인\n\n- 첫 번째");
    expect(second.applied).toHaveLength(0);
    expect(second.unchanged).toHaveLength(1);
  });

  it("UTC+9 기준 유효일 당일까지 활성이고 다음 날부터 만료된다", () => {
    expect(isCheckpointExpired("2026-10-02", new Date("2026-10-02T14:59:59.000Z"))).toBe(false);
    expect(isCheckpointExpired("2026-10-02", new Date("2026-10-02T15:00:00.000Z"))).toBe(true);
    expect(isCheckpointExpired(null, new Date("2030-01-01T00:00:00.000Z"))).toBe(false);
  });

  it("만료된 체크포인트의 수정되지 않은 관리 파일은 rules에서 제거한다", async () => {
    const root = await mkdtemp(join(tmpdir(), "sugo-cp-expired-"));
    const base = {
      workspace: "payments",
      checkpoint: { id: "CP-expired1", title: "기간 한정 규칙", category: "general", checklist: ["10월 2일까지 확인"] },
      projectPaths: [root],
    };
    const first = await applyCheckpointToProjects(base, new Date("2026-10-02T00:00:00.000Z"));
    const file = first.applied[0].file;

    const expired = await applyCheckpointToProjects(
      { ...base, checkpoint: { ...base.checkpoint, expiresAt: "2026-10-02" } },
      new Date("2026-10-02T15:00:00.000Z"),
    );

    expect(expired.removed).toEqual([{ projectPath: root, file }]);
    await expect(access(file)).rejects.toThrow();
  });

  it("만료됐어도 직접 수정된 관리 파일은 삭제하지 않고 충돌로 남긴다", async () => {
    const root = await mkdtemp(join(tmpdir(), "sugo-cp-expired-conflict-"));
    const base = {
      workspace: "payments",
      checkpoint: { id: "CP-expired2", title: "기간 한정 규칙", category: "general", checklist: ["확인"] },
      projectPaths: [root],
    };
    const first = await applyCheckpointToProjects(base, new Date("2026-10-02T00:00:00.000Z"));
    const file = first.applied[0].file;
    await writeFile(file, `${await readFile(file, "utf8")}\n직접 수정\n`);

    const expired = await applyCheckpointToProjects(
      { ...base, checkpoint: { ...base.checkpoint, expiresAt: "2026-10-02" } },
      new Date("2026-10-02T15:00:00.000Z"),
    );

    expect(expired.removed).toHaveLength(0);
    expect(expired.conflicts[0].reason).toContain("만료");
    expect(await readFile(file, "utf8")).toContain("직접 수정");
  });

  it("hash 없는 고정 포맷 파일도 원문이 정확히 같으면 만료 정리한다", async () => {
    const root = await mkdtemp(join(tmpdir(), "sugo-cp-expired-plain-"));
    const dir = join(root, ".claude", "rules", "general");
    await mkdir(dir, { recursive: true });
    const file = join(dir, "CP-plain-단순-규칙.md");
    await writeFile(file, [
      "---", 'description: "Sugo checkpoint CP-plain · payments"', "---", "", "# 단순 규칙", "",
      "> payments 도메인의 재발방지 컨텍스트 · 도메인 전체 적용", "", "- 확인",
    ].join("\n"));

    const result = await applyCheckpointToProjects({
      workspace: "payments",
      checkpoint: { id: "CP-plain", title: "단순 규칙", category: "general", checklist: ["확인"], expiresAt: "2000-01-01" },
      projectPaths: [root],
    });

    expect(result.removed).toEqual([{ projectPath: root, file }]);
    expect(result.conflicts).toEqual([]);
  });
});
