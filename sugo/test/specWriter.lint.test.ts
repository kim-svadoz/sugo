import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleSugoSpecWriter, lintSpecText } from "../src/tools/sugoSpecWriter.js";

// 2026-10-01 인기 목록 화면 추가 spec v1(구현 세부 포함)과 v2(기획자 수준)에서 가져온 줄.
const V1_LIKE = [
  "## 현재 동작 (코드 확인, `development` abc48af)",
  "- 코드: `orders-api` `development` abc48af — `RankingModule26.java`, `ModuleRegistry.java:81`",
  "| `src/main/java/com/example/recomapi/service/module/item/common/list/RankingModule26.java` | 타이틀 처리 분기 |",
  "| `src/test/.../list/RankingModule26Test.java` | 신규 |",
].join("\n");

const V2_LIKE = [
  "# 홈 - 추천 인기 랭킹 영역 추가",
  "- SPEC: `spec-manual-53391678` (workspace `orders`)",
  "- 기한: 2026-10-16",
  "- 추천 결과는 기존 \"기존 랭킹 추천\" 모듈(`RANKING_MODULE_26`)을 그대로 사용한다.",
  "1. 신규 영역의 영역 이름",
  "- 기획 화면 \"16. 추천 기반 상품 랭킹 추천\" (사용자 제공, 2026-10-01)",
].join("\n");

const VALID_SPEC = [
  "# 홈 - 추천 인기 랭킹 영역 추가",
  "## 배경/목적", "사용자에게 필요한 기능을 정의한다.",
  "## 범위", "### In", "- 신규 영역", "### Out", "- 운영 정책 변경",
  "## 요구사항", "### REQ-1: 신규 영역", "- 사용자는 신규 영역을 확인할 수 있다.",
  "## 완료조건", "- 신규 영역이 화면에 표시된다.",
  "## 제약", "- 없음",
  "## Open Questions", "- 없음",
  "## Sources", "- 홈 - 추천 인기 랭킹 영역 추가",
].join("\n\n");
const V1_STRUCTURED = `${VALID_SPEC}\n\n${V1_LIKE}`;

describe("spec-writer complete lint", () => {
  it("v1처럼 구현 경로·파일:줄·커밋 해시가 있으면 각각 경고한다", () => {
    const kinds = new Set(lintSpecText(V1_LIKE).map((w) => w.kind));
    expect(kinds).toEqual(new Set(["implementation-path", "file-line", "commit-hash"]));
  });

  it("v2처럼 업무 수준 이름·날짜·SPEC id만 있으면 경고가 없다", () => {
    expect(lintSpecText(V2_LIKE)).toEqual([]);
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

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "sugo-spec-lint-"));
    attached = [];
    attachmentNames = ["01.png", "02.jpg"];
    process.env.SUGO_HOME_OVERRIDE = dir;
    server = createServer((req, res) => {
      if (req.url?.includes("/spec-attachments/file")) {
        res.writeHead(200, { "Content-Type": "image/png" });
        return res.end(Buffer.from(`png:${new URL(req.url, "http://x").searchParams.get("name")}`));
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      if (req.url?.includes("/spec-attachments")) return res.end(JSON.stringify({ ok: true, locked: false, attachments: attachmentNames.map((name) => ({ name })) }));
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

  it("v1 같은 spec은 경고 목록을 돌려주고 연결하지 않는다", async () => {
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

  it("v2 같은 spec은 바로 연결한다", async () => {
    const data = await complete(VALID_SPEC);
    expect(data.ok).toBe(true);
    expect(attached).toHaveLength(1);
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
