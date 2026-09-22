import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSession, saveSession } from "../src/session.js";
import { handleSugoGetProjectContext } from "../src/tools/sugoGetProjectContext.js";
import { handleSugoPlan } from "../src/tools/sugoPlan.js";
import type { PlanSession } from "../src/types.js";

const execFileAsync = promisify(execFile);

/**
 * 스펙 원문의 "하고 싶은 것" 시나리오를 실제 git 저장소로 재현한다:
 * feature/<이름> 브랜치에서 최초 진입(TODO-SPEC 없음) → 확정 → 생성 → 부분 완료 →
 * 다음 세션에서 자동 로드. 브랜치 조회는 커밋이 최소 1개 있어야 동작한다(unborn HEAD는
 * `git rev-parse --abbrev-ref HEAD`가 exit 128로 실패한다 — 실측 확인).
 */
let fakeHome: string;
let repo: string;

async function git(args: string[]) {
  await execFileAsync("git", args, { cwd: repo });
}

beforeEach(async () => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-todospec-home-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
  repo = mkdtempSync(join(tmpdir(), "sugo-todospec-repo-"));
  await git(["init", "-q", "-b", "feature/abc"]);
  await git(["-c", "user.email=t@t.com", "-c", "user.name=t", "commit", "-q", "-m", "init", "--allow-empty"]);
});

afterEach(() => {
  delete process.env.SUGO_HOME_OVERRIDE;
  rmSync(fakeHome, { recursive: true, force: true });
  rmSync(repo, { recursive: true, force: true });
});

const parse = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

describe("§4.3-T start — 브랜치 감지 + TODO-SPEC 존재 여부", () => {
  it("feature/abc 브랜치에서 TODO-SPEC이 없으면 missing을 반환한다", async () => {
    const r = parse(await handleSugoPlan({ action: "start", projectPath: repo, featureName: "abc" }));
    expect(r.todoSpec.status).toBe("missing");
    expect(r.todoSpec.path).toContain(join("docs", "feature", "abc", "TODO-SPEC.md"));
  });

  it("feature/* 패턴이 아니면 todoSpec 필드가 아예 없다", async () => {
    await git(["checkout", "-q", "-b", "main"]);
    const r = parse(await handleSugoPlan({ action: "start", projectPath: repo, featureName: "abc" }));
    expect(r.todoSpec).toBeUndefined();
  });

  it("git 저장소가 아니면 todoSpec 필드가 없다(브랜치를 못 읽으므로)", async () => {
    const notRepo = mkdtempSync(join(tmpdir(), "sugo-not-repo-"));
    try {
      const r = parse(await handleSugoPlan({ action: "start", projectPath: notRepo, featureName: "abc" }));
      expect(r.todoSpec).toBeUndefined();
    } finally {
      rmSync(notRepo, { recursive: true, force: true });
    }
  });
});

describe("§4.3-T clarify — 최초 목표 분해 확정", () => {
  it("사용자 확인 없이 확정하려 하면 거부한다", async () => {
    const started = parse(await handleSugoPlan({ action: "start", projectPath: repo, featureName: "abc" }));
    const r = parse(
      await handleSugoPlan({
        action: "clarify",
        sessionId: started.sessionId,
        todoSpecGoal: "abc를 출력하는 기능",
        todoSpecItems: ["a 출력", "b 출력", "c 출력"],
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("TODO_SPEC_DRAFT_CONFIRMATION_REQUIRED");
  });

  it("확인하면 고정 템플릿으로 파일이 생성된다", async () => {
    const started = parse(await handleSugoPlan({ action: "start", projectPath: repo, featureName: "abc" }));
    const r = parse(
      await handleSugoPlan({
        action: "clarify",
        sessionId: started.sessionId,
        todoSpecGoal: "abc를 출력하는 기능",
        todoSpecItems: ["a 출력", "b 출력", "c 출력"],
        todoSpecUserConfirmed: true,
      }),
    );
    expect(r.ok).toBe(true);
    const session = await loadSession(started.sessionId);
    expect(session.data.todoSpec?.snapshotAtStart).toContain("- [ ] a 출력");
    expect(session.data.todoSpec?.snapshotAtStart).toContain("- [ ] c 출력");
  });

  it("TODO-SPEC이 없어도 초안을 안 주면(아직 논의 중) 막지 않는다", async () => {
    const started = parse(await handleSugoPlan({ action: "start", projectPath: repo, featureName: "abc" }));
    const r = parse(await handleSugoPlan({ action: "clarify", sessionId: started.sessionId }));
    expect(r.ok).toBe(true);
  });
});

describe("§4.3-T commit 직전 — TODO-SPEC 동기화 게이트(COMMIT_PENDING으로 시딩)", () => {
  async function seedAtCommitPending(snapshotAtStart: string | null): Promise<string> {
    const id = `plan-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    const session: PlanSession = {
      id,
      state: "COMMIT_PENDING",
      projectPath: repo,
      featureName: "abc",
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      data: {
        mode: "plan",
        chainInfo: { changedFiles: [], analyzeAttempts: 1, analyzePassed: true, testPassedState: "pass", reviewPassed: true, autoLoopRetryCount: 0 },
        todoSpec: { featureName: "abc", path: join(repo, "docs", "feature", "abc", "TODO-SPEC.md"), snapshotAtStart },
      },
    } as PlanSession;
    await saveSession(session);
    return id;
  }

  it("파일이 아예 없으면 거부한다", async () => {
    const id = await seedAtCommitPending(null);
    const r = parse(await handleSugoPlan({ action: "commit", sessionId: id }));
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("TODO_SPEC_MISSING_AT_COMMIT");
  });

  it("파일은 있는데 세션 시작 이후 안 바뀌었으면 거부한다", async () => {
    const before = ["## 완료됨", "## 남은 것", "- [ ] a", "- [ ] b"].join("\n");
    const { writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync(join(repo, "docs", "feature", "abc"), { recursive: true });
    writeFileSync(join(repo, "docs", "feature", "abc", "TODO-SPEC.md"), before);

    const id = await seedAtCommitPending(before);
    const r = parse(await handleSugoPlan({ action: "commit", sessionId: id }));
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("TODO_SPEC_SYNC_REQUIRED");
  });

  it("항목을 체크했으면 통과하고 상태가 DONE이 된다", async () => {
    const before = ["## 완료됨", "## 남은 것", "- [ ] a", "- [ ] b"].join("\n");
    const after = ["## 완료됨", "- [x] a", "## 남은 것", "- [ ] b"].join("\n");
    const { writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync(join(repo, "docs", "feature", "abc"), { recursive: true });
    writeFileSync(join(repo, "docs", "feature", "abc", "TODO-SPEC.md"), after);

    const id = await seedAtCommitPending(before);
    const r = parse(await handleSugoPlan({ action: "commit", sessionId: id }));
    expect(r.ok).toBe(true);
    expect(r.state).toBe("DONE");
  });

  it("무관한 사유를 주면 안 바뀌었어도 통과하고 라벨이 남는다", async () => {
    const before = ["## 완료됨", "## 남은 것", "- [ ] a"].join("\n");
    const { writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync(join(repo, "docs", "feature", "abc"), { recursive: true });
    writeFileSync(join(repo, "docs", "feature", "abc", "TODO-SPEC.md"), before);

    const id = await seedAtCommitPending(before);
    const r = parse(await handleSugoPlan({ action: "commit", sessionId: id, todoSpecSyncReason: "긴급 핫픽스, TODO-SPEC과 무관" }));
    expect(r.ok).toBe(true);
    const session = await loadSession(id);
    const labels = session.data.chainInfo.bypassLabels ?? [];
    expect(labels.map((l) => l.kind)).toContain("todoSpecSyncSkipped");
  });

  it("실제로 갱신됐으면 사유를 함께 줘도 라벨을 남기지 않는다", async () => {
    const before = ["## 완료됨", "## 남은 것", "- [ ] a"].join("\n");
    const after = ["## 완료됨", "- [x] a", "## 남은 것"].join("\n");
    const { writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync(join(repo, "docs", "feature", "abc"), { recursive: true });
    writeFileSync(join(repo, "docs", "feature", "abc", "TODO-SPEC.md"), after);

    const id = await seedAtCommitPending(before);
    await handleSugoPlan({ action: "commit", sessionId: id, todoSpecSyncReason: "불필요한 사유" });
    const session = await loadSession(id);
    const labels = session.data.chainInfo.bypassLabels ?? [];
    expect(labels.map((l) => l.kind)).not.toContain("todoSpecSyncSkipped");
  });

  it("feature/* 브랜치가 아니었던 세션(todoSpec 없음)은 게이트 자체가 no-op이다", async () => {
    const id = `plan-${Date.now()}-noop`;
    await saveSession({
      id, state: "COMMIT_PENDING", projectPath: repo, featureName: "x",
      startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      data: { mode: "plan", chainInfo: { changedFiles: [], analyzeAttempts: 1, analyzePassed: true, testPassedState: "pass", reviewPassed: true, autoLoopRetryCount: 0 } },
    } as PlanSession);
    const r = parse(await handleSugoPlan({ action: "commit", sessionId: id }));
    expect(r.ok).toBe(true);
  });
});

describe("§4.3-T start — 같은 프로젝트의 다른 resumable 세션을 알려준다(결정 ③, 강제 병합 아님)", () => {
  it("이전 세션이 REVIEW_RUNNING으로 막혀 있으면 새 start 응답에 그 세션이 잡힌다", async () => {
    const stuck = parse(await handleSugoPlan({ action: "start", projectPath: repo, featureName: "abc" }));
    await saveSession({ ...(await loadSession(stuck.sessionId)), state: "REVIEW_RUNNING" });

    const started = parse(await handleSugoPlan({ action: "start", projectPath: repo, featureName: "abc" }));
    expect(started.otherResumableSessions?.map((s: { sessionId: string }) => s.sessionId)).toContain(stuck.sessionId);
    // 새로 만든 세션 자기 자신은 포함하지 않는다.
    expect(started.otherResumableSessions?.map((s: { sessionId: string }) => s.sessionId)).not.toContain(started.sessionId);
  });

  it("다른 세션이 없으면 필드 자체가 없다", async () => {
    const started = parse(await handleSugoPlan({ action: "start", projectPath: repo, featureName: "abc" }));
    expect(started.otherResumableSessions).toBeUndefined();
  });

  it("DONE으로 끝난 세션은 잡히지 않는다", async () => {
    const done = parse(await handleSugoPlan({ action: "start", projectPath: repo, featureName: "abc" }));
    await saveSession({ ...(await loadSession(done.sessionId)), state: "DONE" });

    const started = parse(await handleSugoPlan({ action: "start", projectPath: repo, featureName: "abc" }));
    expect(started.otherResumableSessions).toBeUndefined();
  });
});

describe("§4.3-T sugo_get_project_context — 세션과 무관하게 자동 로드", () => {
  it("TODO-SPEC이 있으면 원문을 싣는다(sessionId 불필요)", async () => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync(join(repo, "docs", "feature", "abc"), { recursive: true });
    writeFileSync(join(repo, "docs", "feature", "abc", "TODO-SPEC.md"), "# abc\n## 남은 것\n- [ ] a");

    const r = parse(await handleSugoGetProjectContext({ projectPath: repo }));
    expect(r.todoSpec.featureName).toBe("abc");
    expect(r.todoSpec.content).toContain("- [ ] a");
  });

  it("TODO-SPEC이 없으면 content가 null이지만 필드는 온다(브랜치는 feature/*)", async () => {
    const r = parse(await handleSugoGetProjectContext({ projectPath: repo }));
    expect(r.todoSpec.featureName).toBe("abc");
    expect(r.todoSpec.content).toBeNull();
  });

  it("feature/* 브랜치가 아니면 todoSpec이 null", async () => {
    await git(["checkout", "-q", "-b", "main"]);
    const r = parse(await handleSugoGetProjectContext({ projectPath: repo }));
    expect(r.todoSpec).toBeNull();
  });
});
