import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { applyCheckpointToProjects, newCheckpointId } from "../src/services/checkpointApply.js";

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
});
