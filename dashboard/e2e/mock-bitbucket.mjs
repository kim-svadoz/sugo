// Bitbucket Server(Data Center) REST v1.0 mock — dashboard의 createHttpBitbucketClient가
// 실제 HTTP로 branches/pull-requests를 호출하는 경로(URL 구성·응답 파싱·Bearer 헤더)를 검증한다.
// ⚠️ 실제 Bitbucket Server가 아니라 Atlassian 문서 기준 응답 SHAPE를 모사한 것 — 클라이언트
// HTTP 경로는 진짜로 태우지만, 실제 서버의 정확한 응답 형태와의 최종 일치는 여전히 미검증(residual).
import { createServer } from "node:http";
import { E2E_BITBUCKET_URL, PORTS } from "../port-contract.mjs";

const PORT = PORTS.e2eBitbucket;
const created = [];

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "", `http://localhost:${PORT}`);
  const auth = req.headers.authorization ?? "";
  const path = url.pathname;

  // 모든 호출은 Bearer PAT를 요구(dashboard가 붙였는지 확인)
  if (!auth.startsWith("Bearer ")) {
    res.writeHead(401);
    res.end(JSON.stringify({ errors: [{ message: "no token" }] }));
    return;
  }

  // GET .../branches?filterText=<branch>  → {values:[{displayId}]}
  if (req.method === "GET" && path.endsWith("/branches")) {
    const filter = url.searchParams.get("filterText") ?? "";
    // feat/로 시작하는 브랜치는 "존재"한다고 응답, 그 외엔 빈 목록(BRANCH_NOT_PUSHED 유발용)
    const values = filter.startsWith("feat/") ? [{ id: `refs/heads/${filter}`, displayId: filter }] : [];
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ values }));
    return;
  }

  // GET .../pull-requests?...  → 열린 PR 조회. 처음엔 없음(빈), createPullRequest 후엔 생김.
  if (req.method === "GET" && path.endsWith("/pull-requests")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ values: created }));
    return;
  }

  // POST .../pull-requests  → PR 생성. Atlassian 응답: {id, links:{self:[{href}]}}
  if (req.method === "POST" && path.endsWith("/pull-requests")) {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const parsed = JSON.parse(body || "{}");
      const id = created.length + 101;
      const pr = {
        id,
        title: parsed.title,
        links: { self: [{ href: `http://localhost:${PORT}/pr/${id}` }] },
      };
      created.push(pr);
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify(pr));
    });
    return;
  }

  res.writeHead(404);
  res.end("{}");
});

server.listen(PORT, "127.0.0.1", () => console.log(`[bitbucket] mock Bitbucket Server on ${E2E_BITBUCKET_URL}`));
