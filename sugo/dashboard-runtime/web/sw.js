// Console 서버가 꺼져 있을 때 브라우저 연결 오류 화면 대신 다시 여는 방법을 보여 준다.
// 화면 이동 요청만 다루고 API 요청에는 끼어들지 않는다.
const OFFLINE_HTML = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Sugo Console</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #060a14; color: #cbd5e1;
    font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; }
  main { max-width: 440px; padding: 32px 24px; }
  h1 { margin: 0 0 12px; font-size: 18px; color: #f1f5f9; }
  p { margin: 0 0 16px; }
  code { display: block; padding: 12px 14px; border: 1px solid #1e293b; border-radius: 8px; background: #0b1222;
    color: #67e8f9; font: 14px ui-monospace, SFMono-Regular, Menlo, monospace; }
  .status { margin-top: 20px; font-size: 12px; color: #64748b; }
</style>
</head>
<body>
<main>
  <h1>Sugo Console이 꺼져 있습니다</h1>
  <p>Claude Code에서 아래 명령을 실행하면 Console이 다시 뜨고, 이 페이지가 자동으로 다시 열립니다.</p>
  <code>/sugo:console open</code>
  <p class="status" id="status">Console을 찾는 중입니다. 다른 포트로 떠도 그 주소로 옮겨 갑니다.</p>
</main>
<script>
  // Console은 기본 포트나 그다음 빈 포트로 뜬다. 즐겨찾기한 포트와 기본 포트에서 이어지는 포트를 차례로 찾는다.
  const here = Number(location.port || 80);
  const range = (start) => Array.from({ length: 20 }, (_, i) => start + i);
  const order = [...new Set([...range(here), ...range(3001)])];
  async function isConsole(port) {
    try {
      const res = await fetch(location.protocol + "//" + location.hostname + ":" + port + "/health", { cache: "no-store" });
      return (await res.json()).service === "sugo-console";
    } catch {
      return false;
    }
  }
  async function probe() {
    for (const port of order) {
      if (!(await isConsole(port))) continue;
      if (port === here) location.reload();
      else { const next = new URL(location.href); next.port = String(port); location.replace(next.href); }
      return;
    }
    setTimeout(probe, 3000);
  }
  probe();
</script>
</body>
</html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } })),
  );
});
