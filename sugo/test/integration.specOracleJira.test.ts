import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleSugoPlan } from "../src/tools/sugoPlan.js";

async function call(args: unknown) {
  const res = (await handleSugoPlan(args)) as { isError?: boolean; content: { text: string }[] };
  return { isError: !!res.isError, data: JSON.parse(res.content[0].text) };
}

const VALID_PRD = "REQ-1: 이메일 로그인 기능을 제공한다. " + "가".repeat(90);

let fakeHome: string;
let projectDir: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-oracle-home-"));
  projectDir = mkdtempSync(join(tmpdir(), "sugo-oracle-project-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
});

afterEach(() => {
  delete process.env.SUGO_HOME_OVERRIDE;
  rmSync(fakeHome, { recursive: true, force: true });
  rmSync(projectDir, { recursive: true, force: true });
});

async function toPrd(specPath?: string): Promise<string> {
  const start = await call({ action: "start", projectPath: projectDir, featureName: "login" });
  const sessionId = start.data.sessionId as string;
  await call({ action: "clarify", sessionId });
  await call({ action: "prd", sessionId, prdContent: VALID_PRD, specPath });
  return sessionId;
}

describe("스펙 오라클 — 실제 파이프라인 통과", () => {
  it("feat에서 저장한 PRD의 상대경로 이미지가 PRD 옆의 복사본을 가리킨다", async () => {
    const specDir = join(fakeHome, "specs", "v1");
    mkdirSync(join(specDir, "images"), { recursive: true });
    const assets = ["01.png", "02.webp", "03.jpg"];
    for (const name of assets) writeFileSync(join(specDir, "images", name), name);
    const images = assets.map((name) => `![참고 화면](images/${name})`).join("\n");
    const specPath = join(specDir, "spec.md");
    writeFileSync(specPath, images);

    const start = await call({ action: "start", projectPath: projectDir, featureName: "planning images", specPath });
    const { sessionId } = start.data;
    await call({ action: "clarify", sessionId });
    const result = await call({ action: "prd", sessionId, prdContent: `${VALID_PRD}\n\n## 기획 화면\n${images}` });
    const status = await call({ action: "status", sessionId });
    expect(result.isError).toBe(false);
    const prdPath = status.data.prdPath as string;
    const prd = readFileSync(prdPath, "utf8");
    expect(prd).toContain(images);
    for (const name of assets) expect(readFileSync(join(dirname(prdPath), "images", name), "utf8")).toBe(name);
  });

  it("이미지 복사 실패 시 PRD 단계로 넘어가지 않고 원본을 복구한 뒤 재시도할 수 있다", async () => {
    const specPath = join(fakeHome, "spec.md");
    const link = "![참고 화면](images/01.png)";
    writeFileSync(specPath, link);
    const start = await call({ action: "start", projectPath: projectDir, featureName: "missing image", specPath });
    const { sessionId } = start.data;
    await call({ action: "clarify", sessionId });
    const args = { action: "prd", sessionId, prdContent: `${VALID_PRD}\n${link}` };

    const failed = await call(args);
    expect(failed).toMatchObject({ isError: true, data: { errorCode: "PRD_WRITE_FAILED" } });
    expect((await call({ action: "status", sessionId })).data.prdPath).toBeUndefined();
    mkdirSync(join(fakeHome, "images"));
    writeFileSync(join(fakeHome, "images", "01.png"), "restored");
    expect((await call(args)).isError).toBe(false);
  });

  it("기준 스펙 문서가 없으면 게이트가 안 켜져 PRD→ready가 그대로 열린다", async () => {
    const sessionId = await toPrd();
    const ready = await call({ action: "ready", sessionId });
    expect(ready.isError).toBe(false);
    expect(ready.data.state).toBe("READY");
  });

  it("존재하지 않는 specPath는 게이트를 켜지 않는다(자기보고만으로 못 잠금)", async () => {
    const sessionId = await toPrd(join(projectDir, "does-not-exist.md"));
    const ready = await call({ action: "ready", sessionId });
    expect(ready.isError).toBe(false);
  });

  it("실재하는 기준 스펙 문서면 oracle_done 없이는 ready가 막힌다", async () => {
    const specPath = join(projectDir, "spec.md");
    writeFileSync(specPath, "# 기준 스펙\n- 응답에 traceId 포함");
    const sessionId = await toPrd(specPath);

    const blocked = await call({ action: "ready", sessionId });
    expect(blocked.isError).toBe(true);
    expect(blocked.data.errorCode).toBe("SPEC_ORACLE_NOT_RUN");
  });

  it("oracle_done은 상태를 PRD에 그대로 두고 ready만 열어준다", async () => {
    const specPath = join(projectDir, "spec.md");
    writeFileSync(specPath, "# 기준 스펙");
    const sessionId = await toPrd(specPath);

    const oracle = await call({ action: "oracle_done", sessionId });
    expect(oracle.isError).toBe(false);
    expect(oracle.data.state).toBe("PRD"); // 미전이

    const ready = await call({ action: "ready", sessionId });
    expect(ready.isError).toBe(false);
    expect(ready.data.state).toBe("READY");
  });

  it("미커버 항목을 사유 없이 보고하면 oracle_done이 막히고 ready도 여전히 닫혀 있다", async () => {
    const specPath = join(projectDir, "spec.md");
    writeFileSync(specPath, "# 기준 스펙");
    const sessionId = await toPrd(specPath);

    const blocked = await call({
      action: "oracle_done",
      sessionId,
      uncovered: [{ quote: "응답에 traceId 포함", reason: "PRD 누락" }],
    });
    expect(blocked.isError).toBe(true);
    expect(blocked.data.errorCode).toBe("ORACLE_OVERRIDE_REASON_REQUIRED");

    const ready = await call({ action: "ready", sessionId });
    expect(ready.isError).toBe(true);
    expect(ready.data.errorCode).toBe("SPEC_ORACLE_NOT_RUN");
  });

  it("사유를 밝히면 미커버가 있어도 진행된다(정직한 탈출구)", async () => {
    const specPath = join(projectDir, "spec.md");
    writeFileSync(specPath, "# 기준 스펙");
    const sessionId = await toPrd(specPath);

    const oracle = await call({
      action: "oracle_done",
      sessionId,
      uncovered: [{ quote: "응답에 traceId 포함", reason: "PRD 누락" }],
      overrideReason: "관측성 작업은 차기 차수로 이관 합의됨",
    });
    expect(oracle.isError).toBe(false);
    expect((await call({ action: "ready", sessionId })).isError).toBe(false);
  });

  it("JIRA를 경유해도 oracle_done을 거기서 기록할 수 있다(데드락 없음)", async () => {
    const specPath = join(projectDir, "spec.md");
    writeFileSync(specPath, "# 기준 스펙");
    const sessionId = await toPrd(specPath);

    const jira = await call({ action: "jira", sessionId, jiraOption: "skip" });
    expect(jira.isError).toBe(false);
    expect(jira.data.state).toBe("JIRA");

    // 여기서 막히면 이 세션은 영영 ready로 못 간다 — 이 전이가 그 데드락을 막는다.
    const oracle = await call({ action: "oracle_done", sessionId });
    expect(oracle.isError).toBe(false);
    expect(oracle.data.state).toBe("JIRA");

    const ready = await call({ action: "ready", sessionId });
    expect(ready.isError).toBe(false);
    expect(ready.data.state).toBe("READY");
  });
});

describe("jira — 실제 파이프라인", () => {
  it("jiraOption 없이 호출하면 막힌다", async () => {
    const sessionId = await toPrd();
    const r = await call({ action: "jira", sessionId });
    expect(r.isError).toBe(true);
    expect(r.data.errorCode).toBe("JIRA_OPTION_REQUIRED");
  });

  it("link인데 jiraKey가 없으면 막힌다", async () => {
    const sessionId = await toPrd();
    const r = await call({ action: "jira", sessionId, jiraOption: "link" });
    expect(r.isError).toBe(true);
    expect(r.data.errorCode).toBe("JIRA_KEY_REQUIRED");
  });

  it("link + jiraKey면 JIRA로 전이하고 READY까지 이어진다", async () => {
    const sessionId = await toPrd();
    const jira = await call({ action: "jira", sessionId, jiraOption: "link", jiraKey: "PROJ-123" });
    expect(jira.isError).toBe(false);
    expect(jira.data.state).toBe("JIRA");
    expect((await call({ action: "ready", sessionId })).data.state).toBe("READY");
  });

  it("jira를 건너뛰고 PRD→ready 직행도 여전히 가능하다", async () => {
    const sessionId = await toPrd();
    expect((await call({ action: "ready", sessionId })).data.state).toBe("READY");
  });
});
