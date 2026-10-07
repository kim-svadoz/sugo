import { useEffect, useState } from "react";
import { Check, Copy, MessageSquareWarning } from "lucide-react";
import { saveBlockerDecision, type BlockerDecision, type HumanBlocker } from "../api/roadmapMutationsApi.js";
import { blockerResumePrompt } from "../lib/blockerDecision.js";
import { presentSteKorean } from "../lib/steKorean.js";

export function BlockerDecisionPanel({ userId, workspace, taskId, taskTitle, question, decision, blocker, onSaved }: {
  userId: string | null;
  workspace: string;
  taskId: string;
  taskTitle: string;
  question: string | null;
  decision?: BlockerDecision | null;
  blocker?: HumanBlocker | null;
  onSaved?: () => void;
}) {
  const [response, setResponse] = useState(decision?.response ?? "");
  const [saved, setSaved] = useState<BlockerDecision | null>(decision ?? null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setResponse(decision?.response ?? ""); setSaved(decision ?? null); }, [taskId, decision]);

  async function persist(): Promise<BlockerDecision | null> {
    if (!userId || !response.trim()) return null;
    setBusy(true); setError(null);
    try {
      const result = await saveBlockerDecision(userId, workspace, taskId, response.trim());
      setSaved(result.decision); onSaved?.(); return result.decision;
    } catch { setError("결정을 저장하지 못했습니다."); return null; }
    finally { setBusy(false); }
  }
  async function copyResume() {
    const value = saved?.response === response.trim() ? saved : await persist();
    if (!value) return;
    await navigator.clipboard.writeText(blockerResumePrompt({ workspace, taskId, taskTitle, question: blocker?.question || question || "차단 원인 확인 필요", response: value.response, sessionId: blocker?.sessionId, resumeAction: blocker?.resumeAction }));
    setCopied(true); window.setTimeout(() => setCopied(false), 1800);
  }

  return <section className="rounded-xl border border-orange-400/45 bg-orange-400/[0.07] p-3">
    <div className="flex items-center gap-2 text-sm font-semibold text-orange-100"><MessageSquareWarning size={16} /> 사람의 결정이 필요합니다</div>
    {blocker && <div className="mt-2 grid grid-cols-2 gap-2 text-[10.5px]">
      <div className="rounded-lg bg-black/20 px-3 py-2"><span className="text-orange-200/55">현재 상황</span><p className="mt-1 whitespace-pre-line text-orange-50">{presentSteKorean(blocker.summary)}</p></div>
      <div className="rounded-lg bg-black/20 px-3 py-2"><span className="text-orange-200/55">멈춘 단계</span><p className="mt-1 font-mono text-orange-50">{blocker.stage} → {blocker.resumeAction}</p></div>
    </div>}
    <div className="mt-2 rounded-lg bg-black/20 px-3 py-2">
      <div className="text-[10px] text-orange-200/60">결정이 필요한 내용</div>
      <p className="mt-1 whitespace-pre-line text-[12.5px] text-orange-50">{presentSteKorean(blocker?.question || question || "차단 원인이 구체적으로 기록되지 않았습니다. 진행 기준을 직접 입력하세요.")}</p>
    </div>
    {blocker && blocker.context.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-[11px] text-orange-100/75">{blocker.context.map((item) => <li key={item} className="whitespace-pre-line">{presentSteKorean(item)}</li>)}</ul>}
    {blocker && blocker.options.length > 0 && <div className="mt-2 space-y-1.5">{blocker.options.map((option) => <button key={option.id} type="button" onClick={() => setResponse(option.label)} className="w-full rounded-lg border border-orange-300/20 bg-black/15 px-3 py-2 text-left hover:border-orange-300/50"><strong className="text-xs text-orange-50">{option.label}</strong><span className="ml-2 text-[10.5px] text-orange-100/55">{option.impact}</span></button>)}</div>}
    {blocker && <p className="mt-2 text-[10.5px] text-amber-200"><strong>결정 전 멈추는 단계:</strong> {blocker.blockedNextStep}</p>}
    <textarea value={response} onChange={(event) => setResponse(event.target.value)} placeholder="결정 내용과 기준을 구체적으로 입력하세요" className="mt-2 min-h-24 w-full resize-y rounded-lg border border-orange-300/25 bg-slate-950/55 p-2.5 text-xs text-white outline-none focus:border-orange-300/60" />
    <p className="mt-1.5 text-[10px] leading-relaxed text-orange-100/55">저장만으로 차단은 풀리지 않습니다. 재개 프롬프트를 원래 작업 세션에서 실행하면 Sugo가 답변·세션·Task를 검증한 뒤에만 다음 단계로 진행합니다.</p>
    {error && <p className="mt-1 text-[10px] text-rose-300">{error}</p>}
    <div className="mt-2 grid grid-cols-2 gap-2">
      <button disabled={busy || !response.trim()} onClick={() => void persist()} className="rounded-lg border border-orange-300/30 px-2 py-2 text-xs font-semibold text-orange-100 disabled:opacity-40">{saved?.response === response.trim() ? <span className="inline-flex items-center gap-1"><Check size={12} /> 저장됨</span> : "결정 저장"}</button>
      <button disabled={busy || !response.trim()} onClick={() => void copyResume()} className="rounded-lg bg-orange-400/20 px-2 py-2 text-xs font-semibold text-orange-50 disabled:opacity-40"><span className="inline-flex items-center gap-1">{copied ? <Check size={12} /> : <Copy size={12} />}{copied ? "복사됨" : "저장 후 재개 프롬프트 복사"}</span></button>
    </div>
  </section>;
}
