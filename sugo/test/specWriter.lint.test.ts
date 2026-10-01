import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "sugo-spec-lint-"));
    attached = [];
    server = createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
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
    delete process.env.SUGO_DASHBOARD_USER_ID;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  });

  async function complete(content: string, acceptLintWarnings?: boolean) {
    const specPath = join(dir, "spec.md");
    writeFileSync(specPath, content);
    const res = await handleSugoSpecWriter({ action: "complete", workspace: "ws", specDraftId: "spec-manual-1", specPath, acceptLintWarnings });
    return JSON.parse(res.content[0].text);
  }

  it("v1 같은 spec은 경고 목록을 돌려주고 연결하지 않는다", async () => {
    const data = await complete(V1_LIKE);
    expect(data.ok).toBe(false);
    expect(data.errorCode).toBe("SPEC_LINT_WARNINGS");
    expect(data.warnings.length).toBeGreaterThan(0);
    expect(attached).toEqual([]);
  });

  it("사용자 승인 플래그가 있으면 경고가 있어도 연결한다", async () => {
    const data = await complete(V1_LIKE, true);
    expect(data.ok).toBe(true);
    expect(attached).toHaveLength(1);
  });

  it("v2 같은 spec은 바로 연결한다", async () => {
    const data = await complete(V2_LIKE);
    expect(data.ok).toBe(true);
    expect(attached).toHaveLength(1);
  });
});
