import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleSugoSpecWriter, lintSpecText } from "../src/tools/sugoSpecWriter.js";

// 구현 세부가 섞인 SPEC과 기획자 수준 SPEC의 예시 줄.
const V1_LIKE = [
  "## 현재 동작 (코드 확인, `main` abc1234)",
  "- 코드: `account-api` `main` abc1234 — `LoginService.java`, `SecurityConfig.java:81`",
  "| `src/main/java/com/example/account/service/LoginService.java` | 실패 횟수 처리 분기 |",
  "| `src/test/.../service/LoginServiceTest.java` | 신규 |",
].join("\n");

const GOOD_SPEC = [
  "# 로그인 실패 횟수 제한",
  "- SPEC: `spec-manual-10000001` (workspace `account`)",
  "- 기한: 2026-11-02",
  "- 잠금 해제는 기존 \"비밀번호 재설정\" 기능(`PASSWORD_RESET`)을 그대로 사용한다.",
  "1. 잠금 기준 횟수",
  "- 기획 화면 \"3. 로그인 실패 안내\" (사용자 제공, 2026-10-20)",
].join("\n");

const VALID_SPEC = [
  "# 로그인 실패 횟수 제한",
  "## 배경/목적", "반복된 로그인 실패로부터 계정을 보호한다.",
  "## 범위", "### In", "- 실패 횟수 제한", "### Out", "- 비밀번호 정책 변경",
  "## 요구사항", "### REQ-1: 계정 잠금", "- 5회 연속 실패하면 10분 동안 로그인할 수 없다.",
  "## 완료조건", "- 잠긴 계정은 안내 문구를 본다.",
  "## 제약", "- 없음",
  "## Open Questions", "- 없음",
  "## Sources", "- 로그인 실패 횟수 제한",
].join("\n\n");
const V1_STRUCTURED = `${VALID_SPEC}\n\n${V1_LIKE}`;

describe("spec-writer complete lint", () => {
  it("구현 경로·파일:줄·커밋 해시가 있으면 각각 경고한다", () => {
    const kinds = new Set(lintSpecText(V1_LIKE).map((w) => w.kind));
    expect(kinds).toEqual(new Set(["implementation-path", "file-line", "commit-hash"]));
  });

  it("기획 수준 이름·날짜·SPEC id만 있으면 경고가 없다", () => {
    expect(lintSpecText(GOOD_SPEC)).toEqual([]);
  });

  it("줄 번호 표기를 잡는다", () => {
    expect(lintSpecText("see Foo.kt#L12").map((w) => w.kind)).toEqual(["line-number"]);
    expect(lintSpecText("120번째 줄에서 분기").map((w) => w.kind)).toEqual(["line-number"]);
  });
});

describe("spec-writer complete gate", () => {
  let server: Server;
  let dir: string;
  let attached: string[];
  let attachmentNames: string[];
  let draftContent: string;
  let referenceLinks: Array<{ title: string; url: string }>;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "sugo-spec-lint-"));
    attached = [];
    attachmentNames = ["01.png", "02.jpg"];
    draftContent = "";
    referenceLinks = [];
    process.env.SUGO_HOME_OVERRIDE = dir;
    server = createServer((req, res) => {
      if (req.url?.includes("/spec-attachments/file")) {
        res.writeHead(200, { "Content-Type": "image/png" });
        return res.end(Buffer.from(`png:${new URL(req.url, "http://x").searchParams.get("name")}`));
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      if (req.url?.includes("/spec-attachments")) return res.end(JSON.stringify({ ok: true, locked: false, attachments: attachmentNames.map((name) => ({ name })) }));
      if (req.url?.includes("/spec-references")) return res.end(JSON.stringify({ ok: true, locked: false, links: referenceLinks }));
      if (req.url?.includes("/spec-draft")) return res.end(JSON.stringify({ ok: true, content: draftContent }));
      if (req.method === "POST") {
        attached.push(req.url ?? "");
        return res.end("{}");
      }
      res.end(JSON.stringify({ nodes: [{ id: "spec-manual-1", title: "t", level: "spec", status: "pending", parent: null }] }));
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    process.env.SUGO_DASHBOARD_API_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    process.env.SUGO_DASHBOARD_USER_ID = "u1";
  });

  afterEach(async () => {
    delete process.env.SUGO_DASHBOARD_API_URL;
    delete process.env.SUGO_HOME_OVERRIDE;
    delete process.env.SUGO_DASHBOARD_USER_ID;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  });

  async function complete(content: string, acceptLintWarnings?: boolean) {
    const specPath = join(dir, ".claude", "sugo", "specs", "20261015", "t", "v1", "spec.md");
    mkdirSync(dirname(specPath), { recursive: true });
    writeFileSync(specPath, content);
    const res = await handleSugoSpecWriter({ action: "complete", workspace: "ws", specDraftId: "spec-manual-1", specPath, acceptLintWarnings });
    return JSON.parse(res.content[0].text);
  }

  it("구현 세부가 많은 spec은 경고 목록을 돌려주고 연결하지 않는다", async () => {
    const data = await complete(V1_STRUCTURED);
    expect(data.ok).toBe(false);
    expect(data.errorCode).toBe("SPEC_LINT_WARNINGS");
    expect(data.warnings.length).toBeGreaterThan(0);
    expect(attached).toEqual([]);
  });

  it("사용자 승인 플래그가 있으면 경고가 있어도 연결한다", async () => {
    const data = await complete(V1_STRUCTURED, true);
    expect(data.ok).toBe(true);
    expect(attached).toHaveLength(1);
  });

  it("기획 수준 spec은 바로 연결한다", async () => {
    const data = await complete(VALID_SPEC);
    expect(data.ok).toBe(true);
    expect(attached).toHaveLength(1);
  });

  it("프로젝트가 지정된 SPEC은 현행 용어와 자료를 대조한 증거 없이 완료하지 않는다", async () => {
    const projectPath = join(dir, "project");
    mkdirSync(projectPath, { recursive: true });
    writeFileSync(join(projectPath, "README.md"), "# Existing product vocabulary");
    const specPath = join(dir, ".claude", "sugo", "specs", "20261015", "t", "v1", "spec.md");
    mkdirSync(dirname(specPath), { recursive: true });
    writeFileSync(specPath, VALID_SPEC);

    const data = JSON.parse((await handleSugoSpecWriter({
      action: "complete",
      workspace: "ws",
      projectPath,
      specDraftId: "spec-manual-1",
      specPath,
    })).content[0].text);

    expect(data.ok).toBe(false);
    expect(data.errorCode).toBe("SPEC_REVIEW_EVIDENCE_REQUIRED");
    expect(attached).toEqual([]);
  });

  it("프로젝트와 모든 기획자료를 확인하고 핵심 질문을 확정한 경우에만 완료한다", async () => {
    const projectPath = join(dir, "reviewed-project");
    mkdirSync(projectPath, { recursive: true });
    writeFileSync(join(projectPath, "README.md"), "# Existing product vocabulary");
    attachmentNames = [];
    referenceLinks = [{ title: "MAB 기획", url: "https://wiki.example.com/mab" }];
    const specPath = join(dir, ".claude", "sugo", "specs", "20261015", "t", "v1", "spec.md");
    mkdirSync(dirname(specPath), { recursive: true });
    writeFileSync(specPath, VALID_SPEC);

    const data = JSON.parse((await handleSugoSpecWriter({
      action: "complete",
      workspace: "ws",
      projectPath,
      specDraftId: "spec-manual-1",
      specPath,
      reviewEvidence: {
        projectFiles: ["README.md"],
        attachmentPaths: [],
        referenceUrls: ["https://wiki.example.com/mab"],
        alignmentSummary: "현재 제품 용어와 진입 흐름을 대조했고 새 기능의 제품 경계를 사용자와 확정했다.",
        blockingQuestionsResolved: true,
        unreadableSources: [],
      },
    })).content[0].text);

    expect(data.ok).toBe(true);
    expect(attached).toHaveLength(1);
  });

  it("Dashboard가 전달한 기획 링크를 하나라도 검토 증거에서 누락하면 완료하지 않는다", async () => {
    const projectPath = join(dir, "incomplete-review-project");
    mkdirSync(projectPath, { recursive: true });
    writeFileSync(join(projectPath, "README.md"), "# Existing product vocabulary");
    attachmentNames = [];
    referenceLinks = [{ title: "MAB 기획", url: "https://wiki.example.com/mab" }];
    const specPath = join(dir, ".claude", "sugo", "specs", "20261015", "t", "v1", "spec.md");
    mkdirSync(dirname(specPath), { recursive: true });
    writeFileSync(specPath, VALID_SPEC);

    const data = JSON.parse((await handleSugoSpecWriter({
      action: "complete",
      workspace: "ws",
      projectPath,
      specDraftId: "spec-manual-1",
      specPath,
      reviewEvidence: {
        projectFiles: ["README.md"],
        attachmentPaths: [],
        referenceUrls: [],
        alignmentSummary: "현재 제품 용어와 진입 흐름을 대조했지만 연결된 기획 링크는 확인하지 않았다.",
        blockingQuestionsResolved: true,
        unreadableSources: [],
      },
    })).content[0].text);

    expect(data.ok).toBe(false);
    expect(data.errorCode).toBe("SPEC_REVIEW_SOURCE_INCOMPLETE");
    expect(data.missingReferences).toEqual(referenceLinks);
    expect(attached).toEqual([]);
  });

  it("필수 SPEC 섹션이 빠지면 연결하지 않고 누락 목록을 반환한다", async () => {
    const data = await complete("# 제목\n\n## 요구사항\n\n### REQ-1: 동작\n본문은 충분히 길지만 필수 구조가 빠진 문서이므로 연결되면 안 됩니다. 사용자마다 다른 형식이 생기는 것을 완료 게이트에서 차단해야 합니다.");
    expect(data.ok).toBe(false);
    expect(data.errorCode).toBe("SPEC_STRUCTURE_INVALID");
    expect(data.missingSections).toContain("배경/목적");
    expect(data.missingSections).toContain("Sources");
    expect(attached).toEqual([]);
  });

  it("관리 데이터 루트 밖의 개인 절대경로는 SPEC으로 연결하지 않는다", async () => {
    const specPath = join(dir, "personal-spec", "spec.md");
    mkdirSync(dirname(specPath), { recursive: true });
    writeFileSync(specPath, VALID_SPEC);
    const data = JSON.parse((await handleSugoSpecWriter({ action: "complete", workspace: "ws", specDraftId: "spec-manual-1", specPath })).content[0].text);
    expect(data.ok).toBe(false);
    expect(data.errorCode).toBe("SPEC_PATH_OUTSIDE_MANAGED_ROOT");
    expect(attached).toEqual([]);
  });

  it("context는 Schedule에 붙여 넣은 기획 화면을 로컬로 내려받아 경로를 돌려주고, 지운 첨부는 남기지 않는다", async () => {
    const first = JSON.parse((await handleSugoSpecWriter({ action: "context", workspace: "ws", specDraftId: "spec-manual-1" })).content[0].text);
    expect(first.ok).toBe(true);
    expect(first.specTarget.path).toMatch(new RegExp(`^${dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[/\\\\]\\.claude[/\\\\]sugo[/\\\\]specs[/\\\\]\\d{8}[/\\\\]t[/\\\\]v1[/\\\\]spec\\.md$`));
    expect(first.specTarget.version).toBe(1);
    expect(first.attachments).toHaveLength(2);
    expect(readFileSync(first.attachments[0], "utf-8")).toBe("png:01.png");
    attachmentNames = ["02.jpg"];
    const second = JSON.parse((await handleSugoSpecWriter({ action: "context", workspace: "ws", specDraftId: "spec-manual-1" })).content[0].text);
    expect(second.attachments.map((p: string) => p.split(/[\\/]/).pop())).toEqual(["02.jpg"]);
    expect(existsSync(first.attachments[0])).toBe(false);
  });

  it("초안이 기획참고자료를 가리키지만 파일이나 링크가 없으면 첨부 요청 없이 진행하지 않는다", async () => {
    attachmentNames = [];
    draftContent = "회의록의 기획참고자료를 기준으로 자바 담당 범위를 정리한다.";

    const data = JSON.parse((await handleSugoSpecWriter({ action: "context", workspace: "ws", specDraftId: "spec-manual-1" })).content[0].text);

    expect(data.ok).toBe(false);
    expect(data.errorCode).toBe("SPEC_REFERENCED_SOURCE_MISSING");
  });

  it("Schedule SPEC 카드에 저장한 기획 문서 링크를 context에 전달한다", async () => {
    attachmentNames = [];
    draftContent = "기획참고자료를 기준으로 범위를 정리한다.";
    referenceLinks = [{ title: "MAB 정리", url: "https://wiki.example.com/mab" }];

    const data = JSON.parse((await handleSugoSpecWriter({ action: "context", workspace: "ws", specDraftId: "spec-manual-1" })).content[0].text);

    expect(data.ok).toBe(true);
    expect(data.references).toEqual(referenceLinks);
  });

  it("기획참고자료 링크가 있거나 자료 없음이 명시되면 빈 첨부를 허용한다", async () => {
    attachmentNames = [];
    for (const content of [
      "기획참고자료: https://wiki.example.com/planning/123",
      "기획참고자료: 없음",
    ]) {
      draftContent = content;
      const data = JSON.parse((await handleSugoSpecWriter({ action: "context", workspace: "ws", specDraftId: "spec-manual-1" })).content[0].text);
      expect(data.ok).toBe(true);
      expect(data.attachments).toEqual([]);
    }
  });

  it("context는 이미 존재하는 SPEC 버전을 덮어쓰지 않고 다음 빈 버전을 제안한다", async () => {
    const first = JSON.parse((await handleSugoSpecWriter({ action: "context", workspace: "ws", specDraftId: "spec-manual-1" })).content[0].text);
    mkdirSync(dirname(first.specTarget.path), { recursive: true });
    writeFileSync(first.specTarget.path, "# v1");

    const second = JSON.parse((await handleSugoSpecWriter({ action: "context", workspace: "ws", specDraftId: "spec-manual-1" })).content[0].text);
    expect(second.specTarget.version).toBe(2);
    expect(second.specTarget.path).toMatch(/[/\\]v2[/\\]spec\.md$/);
  });

  it("spec.md의 상대경로 이미지 링크는 lint 경고가 아니다", () => {
    expect(lintSpecText("![기획 화면 1](images/01.png)")).toEqual([]);
  });
});
