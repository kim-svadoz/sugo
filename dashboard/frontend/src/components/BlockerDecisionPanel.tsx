import { useEffect, useState } from "react";
import { Check, Copy, MessageSquareWarning } from "lucide-react";
import { saveBlockerDecision, type BlockerDecision, type HumanBlocker } from "../api/roadmapMutationsApi.js";
import { blockerResumePrompt } from "../lib/blockerDecision.js";
import { presentSteKorean } from "../lib/steKorean.js";
import { reviewConfirmationSections } from "../lib/reviewConfirmation.js";

export function BlockerDecisionPanel({ userId, workspace, taskId, taskTitle, question, decision, blocker, onSaved, onOpenReport }: {
  userId: string | null;
  workspace: string;
  taskId: string;
  taskTitle: string;
  question: string | null;
  decision?: BlockerDecision | null;
  blocker?: HumanBlocker | null;
  onSaved?: () => void;
  onOpenReport?: () => void;
}) {
  const [response, setResponse] = useState(decision?.response ?? "");
  const [saved, setSaved] = useState<BlockerDecision | null>(decision ?? null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [decisionNotice, setDecisionNotice] = useState<string | null>(null);
  useEffect(() => {
    setResponse(decision?.response ?? "");
    setSaved(decision ?? null);
    setConfirmDiscard(false);
    setDecisionNotice(null);
  }, [taskId, decision?.response, decision?.answered_at]);

  async function persist(value = response): Promise<BlockerDecision | null> {
    if (!userId || !value.trim()) return null;
    setBusy(true); setError(null);
    try {
      const result = await saveBlockerDecision(userId, workspace, taskId, value.trim());
      setSaved(result.decision); onSaved?.(); return result.decision;
    } catch { setError("결정을 저장하지 못했습니다."); return null; }
    finally { setBusy(false); }
  }
  async function copyResume(nextResponse = response, notice?: string) {
    const normalized = nextResponse.trim();
    const value = saved?.response === normalized ? saved : await persist(normalized);
    if (!value) return;
    await navigator.clipboard.writeText(blockerResumePrompt({ workspace, taskId, taskTitle, question: blocker?.question || question || "차단 원인 확인 필요", response: value.response, sessionId: blocker?.sessionId, resumeAction: blocker?.resumeAction }));
    setDecisionNotice(notice ?? null);
    setCopied(true); window.setTimeout(() => setCopied(false), 1800);
  }

  const reviewSections = blocker?.kind === "review_confirmation" && blocker.reviewPacket
    ? reviewConfirmationSections(blocker.reviewPacket)
    : [];
  const responseReady = response.trim().length > 0 && response.trim() !== "수정 필요 —";
  const revisionText = response === "확인, 진행" ? "" : response;

  function approveReview() {
    if (revisionText.trim() && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    setResponse("확인, 진행");
    setConfirmDiscard(false);
    void copyResume("확인, 진행", "승인으로 저장했습니다. 재개 프롬프트를 복사했습니다.");
  }

  if (Boolean(blocker?.kind === "review_confirmation")) return <section id="review-confirmation-panel" className="space-y-3 rounded-xl border border-amber-300/25 bg-amber-300/[0.04] p-4">
    <h3 className="text-sm font-semibold text-white">작업 결과 확인</h3>
    <p className="text-xs leading-relaxed text-slate-300">보고서를 확인한 뒤 아래에서 진행 또는 수정 요청을 선택하세요. 선택하면 결정을 저장하고 재개 프롬프트를 한 번에 복사합니다.</p>
    <button type="button" onClick={onOpenReport} disabled={!onOpenReport} className="w-full rounded-lg border border-violet-300/30 bg-violet-400/10 px-4 py-3 text-sm font-semibold text-violet-100">리뷰 보고서 HTML로 열기 ↗</button>
    <label className="block text-xs text-slate-300">수정 요청 내용<textarea value={revisionText} onChange={event => { setResponse(event.target.value); setConfirmDiscard(false); setDecisionNotice(null); }} placeholder="수정이 필요할 때만 구체적으로 입력하세요" className="mt-2 min-h-24 w-full rounded-lg border border-white/15 bg-slate-950/50 p-3 text-sm text-white" /></label>
    {confirmDiscard && <div role="alert" className="rounded-lg border border-amber-300/30 bg-amber-300/[0.08] px-3 py-2 text-xs leading-relaxed text-amber-100"><strong>입력한 수정 요청이 있습니다.</strong> 승인하면 이 내용은 저장되지 않습니다. 승인하려면 ‘그래도 승인’을 누르세요.</div>}
    <div className="grid grid-cols-2 gap-2">
      <button type="button" disabled={busy} onClick={approveReview} className="rounded-lg bg-emerald-400/15 px-4 py-3 text-sm font-semibold text-emerald-200 disabled:opacity-50">{confirmDiscard ? "그래도 승인" : "승인하고 진행"}</button>
      <button type="button" disabled={busy || !revisionText.trim()} onClick={() => void copyResume(revisionText, "수정 요청으로 저장했습니다. 재개 프롬프트를 복사했습니다.")} className="rounded-lg border border-rose-300/25 bg-rose-400/[0.06] px-4 py-3 text-sm font-semibold text-rose-100 disabled:opacity-40">수정 요청</button>
    </div>
    {decisionNotice && <p role="status" className="rounded-lg bg-black/20 px-3 py-2 text-xs text-emerald-200">{decisionNotice}</p>}
    {copied && <p className="text-xs text-slate-400">원래 작업 세션에 프롬프트를 붙여넣으면 검증 후 파이프라인이 재개됩니다.</p>}
    {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
  </section>;

  return <section id={blocker?.kind === "review_confirmation" ? "review-confirmation-panel" : undefined} tabIndex={blocker?.kind === "review_confirmation" ? -1 : undefined} className="scroll-mt-4 rounded-xl border border-orange-400/45 bg-orange-400/[0.07] p-3 outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60">
    <div className="flex items-center gap-2 text-sm font-semibold text-orange-100"><MessageSquareWarning size={16} /> {blocker?.kind === "review_confirmation" ? "작업 결과 확인" : "사람의 결정이 필요합니다"}</div>
    {blocker && <div className="mt-2 grid grid-cols-2 gap-2 text-[10.5px]">
      <div className="rounded-lg bg-black/20 px-3 py-2"><span className="text-orange-200/55">현재 상황</span><p className="mt-1 whitespace-pre-line text-orange-50">{presentSteKorean(blocker.summary)}</p></div>
      <div className="rounded-lg bg-black/20 px-3 py-2"><span className="text-orange-200/55">멈춘 단계</span><p className="mt-1 font-mono text-orange-50">{blocker.stage} → {blocker.resumeAction}</p></div>
    </div>}
    <div className="mt-2 rounded-lg bg-black/20 px-3 py-2">
      <div className="text-[10px] text-orange-200/60">결정이 필요한 내용</div>
      <p className="mt-1 whitespace-pre-line text-[12.5px] text-orange-50">{presentSteKorean(blocker?.question || question || "차단 원인이 구체적으로 기록되지 않았습니다. 진행 기준을 직접 입력하세요.")}</p>
    </div>
    {reviewSections.length > 0 && <div className="mt-3 grid gap-2 md:grid-cols-2">
      {reviewSections.map((section) => <section key={section.id} className={section.id === "summary" ? "rounded-lg border border-cyan-300/20 bg-cyan-300/[0.05] p-3 md:col-span-2" : "rounded-lg border border-white/10 bg-black/15 p-3"}>
        <h4 className="text-[10.5px] font-semibold text-cyan-200">{section.title}</h4>
        <ul className="mt-1.5 space-y-1 text-[11.5px] leading-relaxed text-slate-200">
          {section.items.map((item, index) => <li key={`${section.id}-${index}`} className="whitespace-pre-line">{section.items.length > 1 ? "• " : ""}{presentSteKorean(item)}</li>)}
        </ul>
      </section>)}
    </div>}
    {blocker && blocker.context.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-[11px] text-orange-100/75">{blocker.context.map((item) => <li key={item} className="whitespace-pre-line">{presentSteKorean(item)}</li>)}</ul>}
    {blocker && blocker.options.length > 0 && <div className={`mt-2 ${blocker.kind === "review_confirmation" ? "grid grid-cols-2 gap-2" : "space-y-1.5"}`}>{blocker.options.map((option) => <button key={option.id} type="button" onClick={() => setResponse(option.id === "revise" ? "수정 필요 — " : option.label)} className={`w-full rounded-lg border px-3 py-2 text-left ${option.id === "approve" ? "border-emerald-300/30 bg-emerald-400/10 hover:border-emerald-300/60" : option.id === "revise" ? "border-rose-300/30 bg-rose-400/[0.07] hover:border-rose-300/60" : "border-orange-300/20 bg-black/15 hover:border-orange-300/50"}`}><strong className="text-xs text-orange-50">{option.label}</strong><span className="ml-2 text-[10.5px] text-orange-100/55">{option.impact}</span></button>)}</div>}
    {blocker && <p className="mt-2 text-[10.5px] text-amber-200"><strong>결정 전 멈추는 단계:</strong> {blocker.blockedNextStep}</p>}
    <textarea value={response} onChange={(event) => setResponse(event.target.value)} placeholder={blocker?.kind === "review_confirmation" ? "수정이 필요하면 변경할 내용을 구체적으로 입력하세요" : "결정 내용과 기준을 구체적으로 입력하세요"} className="mt-2 min-h-24 w-full resize-y rounded-lg border border-orange-300/25 bg-slate-950/55 p-2.5 text-xs text-white outline-none focus:border-orange-300/60" />
    <p className="mt-1.5 text-[10px] leading-relaxed text-orange-100/55">저장만으로 차단은 풀리지 않습니다. 재개 프롬프트를 원래 작업 세션에서 실행하면 Sugo가 답변·세션·Task를 검증한 뒤에만 다음 단계로 진행합니다.</p>
    {error && <p className="mt-1 text-[10px] text-rose-300">{error}</p>}
    <div className="mt-2 grid grid-cols-2 gap-2">
      <button disabled={busy || !responseReady} onClick={() => void persist()} className="rounded-lg border border-orange-300/30 px-2 py-2 text-xs font-semibold text-orange-100 disabled:opacity-40">{saved?.response === response.trim() ? <span className="inline-flex items-center gap-1"><Check size={12} /> 저장됨</span> : "결정 저장"}</button>
      <button disabled={busy || !responseReady} onClick={() => void copyResume()} className="rounded-lg bg-orange-400/20 px-2 py-2 text-xs font-semibold text-orange-50 disabled:opacity-40"><span className="inline-flex items-center gap-1">{copied ? <Check size={12} /> : <Copy size={12} />}{copied ? "복사됨" : "저장 후 재개 프롬프트 복사"}</span></button>
    </div>
  </section>;
}
