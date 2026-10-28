/**
 * README 흐름도 생성기. Console과 같은 색으로 기능 하나가 지나가는 단계와 되돌아가는 지점을 그려 PNG로 저장한다.
 *
 *   node dashboard/e2e/readme-flow.mjs   # 결과: docs/images/sugo-flow.png, docs/images/sugo-flow.en.png
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const out = join(repo, "docs", "images");

const copy = {
  ko: {
    file: "sugo-flow.png",
    stages: [["스펙", "요구사항과 완료 조건", "human"], ["구현", "코드 에이전트", "ai"], ["테스트", "테스트 에이전트", "ai"], ["검토", "읽기 전용 검토 에이전트", "ai"], ["사람 승인", "보고서와 diff", "human"], ["커밋", "문서와 리포트를 남긴 뒤", "ai"]],
    gates: ["실행 기록을 확인", "규칙과 보안을 확인", "요구사항별로 확인"],
    backs: ["테스트가 실패하면", "도메인 규칙을 어기면", "수정을 요청하면"],
    back: "구현으로 되돌림",
    legend: ["사람이 정하는 단계", "AI가 하는 단계"],
  },
  en: {
    file: "sugo-flow.en.png",
    stages: [["Spec", "Requirements and criteria", "human"], ["Implement", "Code agent", "ai"], ["Test", "Test agent", "ai"], ["Review", "Read-only review agent", "ai"], ["Approve", "Report and diff", "human"], ["Commit", "After docs and report", "ai"]],
    gates: ["Checks run records", "Checks rules and security", "Checks each requirement"],
    backs: ["If a test fails", "If a domain rule is broken", "If changes are requested"],
    back: "Back to implementation",
    legend: ["Human step", "AI step"],
  },
};

function svg(c) {
  const W = 1200, boxW = 158, boxH = 74, gap = (W - 60 - boxW * 6) / 5, top = 96;
  const x = (i) => 30 + i * (boxW + gap);
  const color = (kind) => kind === "human" ? "#fbbf24" : "#67e8f9";
  const fill = (kind) => kind === "human" ? "rgba(251,191,36,0.08)" : "rgba(103,232,249,0.06)";
  const boxes = c.stages.map(([title, sub, kind], i) => `
    <rect x="${x(i)}" y="${top}" width="${boxW}" height="${boxH}" rx="14" fill="${fill(kind)}" stroke="${color(kind)}" stroke-opacity="0.55" stroke-width="1.5"/>
    <text x="${x(i) + boxW / 2}" y="${top + 32}" text-anchor="middle" font-size="19" font-weight="700" fill="${kind === "human" ? "#fde68a" : "#e0f7fa"}">${title}</text>
    <text x="${x(i) + boxW / 2}" y="${top + 55}" text-anchor="middle" font-size="12.5" fill="#94a3b8">${sub}</text>`).join("");
  const arrows = c.stages.slice(0, -1).map((_, i) => `
    <line x1="${x(i) + boxW + 6}" y1="${top + boxH / 2}" x2="${x(i + 1) - 8}" y2="${top + boxH / 2}" stroke="#475569" stroke-width="2" marker-end="url(#fwd)"/>`).join("");
  const gates = c.gates.map((label, k) => {
    const cx = x(k + 2) + boxW / 2;
    return `<g class="gate" data-cx="${cx}"><rect y="${top - 46}" height="28" rx="14" fill="#0f172a" stroke="#334155"/>
      <circle cy="${top - 32}" r="5" fill="#34d399"/>
      <text y="${top - 27}" font-size="12.5" fill="#cbd5e1">${label}</text></g>
      <line x1="${cx}" y1="${top - 18}" x2="${cx}" y2="${top - 2}" stroke="#334155" stroke-width="1.5"/>`;
  }).join("");
  const target = x(1) + boxW / 2;
  const backs = c.backs.map((label, k) => {
    const from = x(k + 2) + boxW / 2 + (k === 0 ? 0 : 0);
    const depth = top + boxH + 42 + k * 46;
    const tx = target - 36 + k * 36;
    return `<path d="M ${from} ${top + boxH + 4} L ${from} ${depth - 12} Q ${from} ${depth} ${from - 12} ${depth} L ${tx + 12} ${depth} Q ${tx} ${depth} ${tx} ${depth - 12} L ${tx} ${top + boxH + 10}"
        fill="none" stroke="#fb7185" stroke-opacity="0.85" stroke-width="2" stroke-dasharray="6 5" marker-end="url(#back)"/>
      <g class="back" data-x="${from + 12}"><rect y="${depth - 15}" height="30" rx="15" fill="#1c1017" stroke="#fb7185" stroke-opacity="0.45"/>
      <text y="${depth + 5}" font-size="13.5" font-weight="600" fill="#fda4af">${label}</text></g>`;
  }).join("");
  const H = top + boxH + 42 + 2 * 46 + 60;
  const legend = `<g transform="translate(30 ${H - 26})">
      <rect width="14" height="14" rx="4" fill="rgba(251,191,36,0.15)" stroke="#fbbf24"/><text x="22" y="12" font-size="13" fill="#94a3b8">${c.legend[0]}</text>
      <rect x="180" width="14" height="14" rx="4" fill="rgba(103,232,249,0.12)" stroke="#67e8f9"/><text x="202" y="12" font-size="13" fill="#94a3b8">${c.legend[1]}</text>
      <line x1="360" y1="7" x2="392" y2="7" stroke="#fb7185" stroke-width="2" stroke-dasharray="6 5"/><text x="402" y="12" font-size="13" fill="#94a3b8">${c.back}</text>
    </g>`;
  return { W, H, body: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Apple SD Gothic Neo','Pretendard','Noto Sans KR',sans-serif">
    <defs>
      <marker id="fwd" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M0,1 L10,6 L0,11 z" fill="#64748b"/></marker>
      <marker id="back" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M0,1 L10,6 L0,11 z" fill="#fb7185"/></marker>
    </defs>
    <rect width="${W}" height="${H}" rx="18" fill="#0b1120"/>
    ${gates}${arrows}${boxes}${backs}${legend}
  </svg>` };
}

const browser = await chromium.launch();
const page = await (await browser.newContext({ deviceScaleFactor: 2 })).newPage();
for (const c of Object.values(copy)) {
  const { W, H, body } = svg(c);
  await page.setViewportSize({ width: W, height: H });
  await page.setContent(`<html><body style="margin:0;background:#0b1120">${body}</body></html>`);
  // 글자 폭을 실제로 재서 라벨 상자를 맞춘다.
  await page.evaluate(() => {
    for (const g of document.querySelectorAll("g.gate")) {
      const text = g.querySelector("text"), width = text.getBBox().width + 44, x = Number(g.dataset.cx) - width / 2;
      g.querySelector("rect").setAttribute("x", x); g.querySelector("rect").setAttribute("width", width);
      g.querySelector("circle").setAttribute("cx", x + 16); text.setAttribute("x", x + 30);
    }
    for (const g of document.querySelectorAll("g.back")) {
      const text = g.querySelector("text"), x = Number(g.dataset.x);
      g.querySelector("rect").setAttribute("x", x); g.querySelector("rect").setAttribute("width", text.getBBox().width + 28);
      text.setAttribute("x", x + 14);
    }
  });
  await page.screenshot({ path: join(out, c.file), clip: { x: 0, y: 0, width: W, height: H } });
}
await browser.close();
console.log(`[readme-flow] ${out}`);
