import { useEffect, useMemo, useState } from "react";

// §5 Playbook — 100% 시뮬레이션 학습 가이드(네트워크 없음). sugo 파이프라인이 어떻게 도는지
// 가짜 데이터로 재생하며 보여준다. 신규 사용자가 대시보드가 "실제로 쓰면 이렇게 보인다"를 학습.
interface Stage {
  key: string;
  label: string;
  desc: string;
  gates: string[];
  log: { agent: string; msg: string };
}

const STAGES: Stage[] = [
  { key: "prd", label: "PRD", desc: "요구사항을 명세(PRD)로 확정한다. 100자 미만이면 게이트가 막는다.", gates: ["PRD 콘텐츠"], log: { agent: "PLAN", msg: "PRD 확정: 이메일 로그인 기능" } },
  { key: "code", label: "Code", desc: "code-agent가 구현. baseline 그린 확인 + sugo_analyze 호출 + 배선/글루/부팅 게이트.", gates: ["baseline", "analyze", "wiring", "glue", "boot"], log: { agent: "CODE", msg: "EmailLoginService 구현, analyze 통과" } },
  { key: "test", label: "Test", desc: "test-agent가 PRD에서 테스트를 도출(구현 아님). 풀검증 실행 증거를 서버에 기록.", gates: ["test-evidence", "coverage"], log: { agent: "TEST", msg: "단위12+통합2 작성, gradlew check 그린" } },
  { key: "review", label: "Review", desc: "review-agent가 하네스 검증 + 4중 게이트(사용자확인·런타임·계약증거).", gates: ["user-confirm", "runtime", "contract"], log: { agent: "REVIEW", msg: "work-result 리포트, 런타임 검증 OK" } },
  { key: "docs", label: "Docs", desc: "docs-agent가 변경에 맞춰 README를 갱신(문서 파일만).", gates: [], log: { agent: "DOCS", msg: "README 로그인 섹션 갱신" } },
  { key: "commit", label: "Commit", desc: "완료등급 판정. 우회 라벨이 없으면 verified.", gates: ["label-guard"], log: { agent: "PLAN", msg: "커밋 · 완료등급 verified" } },
];

function nodeStatus(stageIdx: number, current: number, done: boolean): string {
  if (done) return "done";
  if (stageIdx < current) return "done";
  if (stageIdx === current) return "in_progress";
  return "pending";
}
const COLOR: Record<string, string> = { done: "#34d399", in_progress: "#00b4d8", pending: "#94a3b8" };

export function Playbook() {
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(true);
  const done = current >= STAGES.length;

  useEffect(() => {
    if (!playing || done) return;
    const t = setTimeout(() => setCurrent((c) => c + 1), 1600);
    return () => clearTimeout(t);
  }, [playing, current, done]);

  const feed = useMemo(() => STAGES.slice(0, Math.min(current + 1, STAGES.length)), [current]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-lg font-bold ck-text-glow" style={{ color: "var(--color-primary)" }}>Playbook</h1>
        <span className="ck-pill" style={{ color: "var(--color-secondary)", borderColor: "rgba(139,92,246,0.4)" }}>simulation</span>
        <span className="text-xs text-slate-400">네트워크 호출 없는 학습 가이드 — sugo 파이프라인이 도는 모습</span>
        <div className="ml-auto flex gap-2">
          <button type="button" className="ck-btn text-xs" onClick={() => { setCurrent(0); setPlaying(true); }}>↻ 처음부터</button>
          <button type="button" className="ck-btn ck-btn-primary text-xs" onClick={() => setPlaying((p) => !p)}>{playing && !done ? "❚❚ 일시정지" : "▶ 재생"}</button>
        </div>
      </div>

      {/* 파이프라인 스텝퍼 */}
      <div className="ck-glass ck-card ck-scan">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {STAGES.map((s, i) => {
            const st = nodeStatus(i, current, done);
            const c = COLOR[st];
            return (
              <div key={s.key} className="flex items-center">
                <button type="button" onClick={() => { setCurrent(i); setPlaying(false); }}
                  className="flex flex-col items-center gap-1 rounded-lg px-3 py-2 transition" style={{ background: i === current && !done ? "rgba(0,180,216,0.08)" : "transparent" }}>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full font-mono text-xs" style={{ border: `1.5px solid ${c}`, color: c, boxShadow: st === "in_progress" ? `0 0 12px ${c}77` : "none" }}>
                    {st === "done" ? "✓" : i + 1}
                  </span>
                  <span className="font-mono text-[0.68rem]" style={{ color: st === "pending" ? "#64748b" : c }}>{s.label}</span>
                </button>
                {i < STAGES.length - 1 && <div className="h-0.5 w-8" style={{ background: i < current ? COLOR.done : "rgba(148,163,184,0.2)" }} />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 현재 단계 설명 + 게이트 */}
        <div className="ck-glass ck-card lg:col-span-2">
          {done ? (
            <div className="space-y-2">
              <div className="font-mono text-sm" style={{ color: COLOR.done }}>파이프라인 완료 · 완료등급 verified ✓</div>
              <p className="text-sm text-slate-300">각 전이는 게이트가 "실행 증거"로만 통과시킵니다. 자기보고로는 못 넘어갑니다 — 이게 sugo의 정체성입니다.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="ck-pill" style={{ color: COLOR.in_progress, borderColor: "rgba(0,180,216,0.4)" }}>{STAGES[current].label}</span>
                <span className="font-mono text-xs text-slate-400">{current + 1}/{STAGES.length}</span>
              </div>
              <p className="text-sm text-slate-200">{STAGES[current].desc}</p>
              {STAGES[current].gates.length > 0 && (
                <div>
                  <div className="mb-1 text-[0.68rem] font-mono uppercase text-slate-500">이 단계의 게이트</div>
                  <div className="flex flex-wrap gap-1.5">
                    {STAGES[current].gates.map((g) => (
                      <span key={g} className="ck-pill neon-border-cyan" style={{ color: "#7de3ff" }}>🔒 {g}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 시뮬 태스크 노드 */}
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-white/10 p-3">
            {(() => {
              const st = done ? "done" : "in_progress";
              const c = COLOR[st];
              return (
                <>
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ border: `1.5px solid ${c}`, color: c }}>
                    {st === "done" ? "✓" : <span className="h-2 w-2 rounded-full ck-pulse-dot" style={{ background: c }} />}
                  </span>
                  <div>
                    <div className="font-mono text-sm text-slate-100">이메일 로그인</div>
                    <div className="text-[0.68rem] font-mono" style={{ color: c }}>{done ? "done" : `in_progress · ${STAGES[current].label}`}</div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* 시뮬 액티비티 콘솔 */}
        <div className="ck-glass ck-card">
          <div className="mb-2 text-[0.68rem] font-mono uppercase text-slate-500">Live Console (sim)</div>
          <div className="space-y-1.5">
            {feed.map((s) => (
              <div key={s.key} className="ck-line-in flex items-start gap-2 text-xs">
                <span className="ck-pill shrink-0" style={{ fontSize: "0.56rem", color: "var(--color-primary)", borderColor: "rgba(0,180,216,0.3)" }}>{s.log.agent}</span>
                <span className="text-slate-300">{s.log.msg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
