import { useEffect, useState } from "react";
import { Check, ClipboardCheck, Copy, ExternalLink, FileDiff, MessageSquareWarning } from "lucide-react";
import { saveBlockerDecision, type BlockerDecision, type HumanBlocker } from "../api/roadmapMutationsApi.js";
import { blockerResumePrompt } from "../lib/blockerDecision.js";
import { presentSteKorean } from "../lib/steKorean.js";
import { reviewConfirmationSections } from "../lib/reviewConfirmation.js";

export function BlockerDecisionPanel({ userId, workspace, taskId, taskTitle, question, decision, blocker, onSaved, onOpenReport, onOpenDiff }: {
  userId: string | null;
  workspace: string;
  taskId: string;
  taskTitle: string;
  question: string | null;
  decision?: BlockerDecision | null;
  blocker?: HumanBlocker | null;
  onSaved?: () => void;
  onOpenReport?: () => void;
  onOpenDiff?: () => void;
}) {
  const [response, setResponse] = useState(decision?.response ?? "");
  const [saved, setSaved] = useState<BlockerDecision | null>(decision ?? null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decisionNotice, setDecisionNotice] = useState<string | null>(null);
  const [reportChecked, setReportChecked] = useState(false);
  const [diffChecked, setDiffChecked] = useState(false);
  const [noRequest, setNoRequest] = useState(false);
  useEffect(() => {
    setDecisionNotice(null);
    setReportChecked(false);
    setDiffChecked(false);
    setNoRequest(false);
  }, [taskId]);
  useEffect(() => {
    setResponse(decision?.response ?? "");
    setSaved(decision ?? null);
  }, [decision?.response, decision?.answered_at]);

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
  const reviewEvidenceReady = reportChecked && diffChecked;
  const reviewDecisionReady = reviewEvidenceReady && (noRequest || revisionText.trim().length > 0);

  async function submitReview(value: string, notice: string) {
    setResponse(value);
    const savedDecision = await persist(value);
    if (savedDecision) setDecisionNotice(notice);
  }

  if (Boolean(blocker?.kind === "review_confirmation")) return <section id="review-confirmation-panel" tabIndex={-1} className="scroll-mt-6 overflow-hidden rounded-2xl border border-amber-300/30 bg-[#111721] outline-none shadow-[0_18px_50px_rgba(0,0,0,.20)] focus-visible:ring-2 focus-visible:ring-amber-200/70">
    <header className="flex items-start gap-3 border-b border-amber-200/10 bg-amber-300/[0.045] px-5 py-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-300/10 text-amber-200"><ClipboardCheck size={19} /></span>
      <span className="min-w-0 flex-1"><span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-amber-300">YOUR DECISION</span><h3 className="mt-1 text-base font-semibold text-white">작업 결과 확인</h3><p className="mt-1 text-xs leading-5 text-slate-400">검토 자료를 확인하고 진행 또는 수정 요청을 선택하세요. 저장된 결정은 대기 중인 작업 세션에 자동으로 전달됩니다.</p></span>
      <span className="shrink-0 rounded-full border border-amber-300/20 bg-amber-300/[0.07] px-2.5 py-1 text-[10px] font-semibold text-amber-200">사용자 승인 필요</span>
    </header>
    <div className="grid grid-cols-3 border-b border-white/[0.07] bg-black/10 px-5 py-3">
      {[{ label: "결과 확인", done: reviewEvidenceReady, active: !reviewEvidenceReady }, { label: "요청 사항", done: reviewEvidenceReady && (noRequest || revisionText.trim().length > 0), active: reviewEvidenceReady && !reviewDecisionReady }, { label: "다음 단계", done: Boolean(saved), active: reviewDecisionReady }].map((step, index) => <div key={step.label} className="flex min-w-0 items-center gap-2"><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] ${step.done ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-200" : step.active ? "border-amber-300/45 bg-amber-300/10 text-amber-100" : "border-white/10 text-slate-600"}`}>{step.done ? <Check size={12} /> : index + 1}</span><span className={`text-[11px] font-semibold ${step.active ? "text-white" : step.done ? "text-emerald-200" : "text-slate-600"}`}>{step.label}</span>{index < 2 && <span className={`ml-auto h-px min-w-3 flex-1 ${step.done ? "bg-emerald-300/30" : "bg-white/[0.07]"}`} />}</div>)}
    </div>
    <div className="space-y-5 p-5">
      <section><div className="mb-2 flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-300/10 font-mono text-[10px] text-violet-200">1</span><h4 className="text-xs font-semibold text-slate-200">검토 자료</h4><span className="text-[10px] text-slate-500">자료를 본 뒤 직접 확인해 주세요</span></div><div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-violet-300/20 bg-violet-400/[0.05] p-3"><button type="button" onClick={onOpenReport} disabled={!onOpenReport} className="group flex w-full items-center gap-3 text-left outline-none disabled:opacity-40"><ExternalLink size={17} className="text-violet-300" /><span><strong className="block text-sm text-violet-100">리뷰 보고서 HTML로 열기</strong><span className="mt-0.5 block text-[10px] text-slate-400">요구사항, 테스트와 남은 위험 확인</span></span></button><button type="button" role="checkbox" aria-checked={reportChecked} onClick={() => setReportChecked((value) => !value)} className={`mt-3 flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-semibold outline-none ${reportChecked ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200" : "border-white/10 bg-black/10 text-slate-300 hover:border-violet-200/30"}`}><span className={`flex h-4 w-4 items-center justify-center rounded border ${reportChecked ? "border-emerald-300 bg-emerald-300 text-emerald-950" : "border-slate-500"}`}>{reportChecked && <Check size={11} />}</span>보고서를 확인했습니다</button></div>
        <div className="rounded-xl border border-cyan-300/20 bg-cyan-400/[0.045] p-3"><button type="button" onClick={onOpenDiff} disabled={!onOpenDiff} className="group flex w-full items-center gap-3 text-left outline-none disabled:opacity-40"><FileDiff size={17} className="text-cyan-300" /><span><strong className="block text-sm text-cyan-100">이번 변경 파일 diff 보기</strong><span className="mt-0.5 block text-[10px] text-slate-400">실제 변경된 코드와 파일 확인</span></span></button><button type="button" role="checkbox" aria-checked={diffChecked} onClick={() => setDiffChecked((value) => !value)} className={`mt-3 flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-semibold outline-none ${diffChecked ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200" : "border-white/10 bg-black/10 text-slate-300 hover:border-cyan-200/30"}`}><span className={`flex h-4 w-4 items-center justify-center rounded border ${diffChecked ? "border-emerald-300 bg-emerald-300 text-emerald-950" : "border-slate-500"}`}>{diffChecked && <Check size={11} />}</span>변경 파일을 확인했습니다</button></div>
      </div>{!reviewEvidenceReady && <p className="mt-2 text-[10px] text-amber-200/75">검토 항목을 모두 확인해야 다음 단계로 갈 수 있습니다.</p>}</section>
      <section className={!reviewEvidenceReady ? "pointer-events-none opacity-40" : ""}><div className="mb-2 flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-300/10 font-mono text-[10px] text-amber-200">2</span><h4 className="text-xs font-semibold text-slate-200">요청 사항</h4></div><label className="sr-only" htmlFor="review-revision">수정 요청 내용</label><textarea id="review-revision" disabled={!reviewEvidenceReady || noRequest} value={revisionText} onChange={event => { setResponse(event.target.value); setNoRequest(false); setDecisionNotice(null); }} placeholder="예: Redis 장애 시 기존 서빙으로 전환되는 조건을 테스트에 추가해 주세요." className="min-h-24 w-full resize-y rounded-xl border border-white/10 bg-slate-950/55 p-3 text-sm text-white outline-none transition-colors placeholder:text-slate-600 focus:border-amber-300/45 focus:ring-2 focus:ring-amber-300/10 disabled:opacity-50" /><button type="button" role="checkbox" aria-checked={noRequest} disabled={!reviewEvidenceReady} onClick={() => { setNoRequest((value) => !value); setResponse(""); setDecisionNotice(null); }} className={`mt-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-semibold ${noRequest ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200" : "border-white/10 text-slate-300"}`}><span className={`flex h-4 w-4 items-center justify-center rounded border ${noRequest ? "border-emerald-300 bg-emerald-300 text-emerald-950" : "border-slate-500"}`}>{noRequest && <Check size={11} />}</span>요청 사항 없음</button></section>
      <section className={!reviewDecisionReady ? "opacity-40" : ""}><div className="mb-2 flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-300/10 font-mono text-[10px] text-emerald-200">3</span><h4 className="text-xs font-semibold text-slate-200">다음 단계</h4></div>{noRequest ? <button type="button" disabled={busy || !reviewDecisionReady} onClick={() => void submitReview("확인, 진행", "승인이 저장되었습니다. 작업 세션이 결정을 감지하면 자동으로 계속 진행합니다.")} className="w-full rounded-xl border border-emerald-300/25 bg-emerald-400/15 px-4 py-3 text-sm font-semibold text-emerald-100 outline-none transition-colors hover:bg-emerald-400/20 focus-visible:ring-2 focus-visible:ring-emerald-200/60 disabled:opacity-50">승인하고 계속하기</button> : <button type="button" disabled={busy || !reviewDecisionReady} onClick={() => void submitReview(revisionText, "수정 요청이 저장되었습니다. 작업 세션이 결정을 감지하면 자동으로 수정 작업을 시작합니다.")} className="w-full rounded-xl border border-rose-300/25 bg-rose-400/[0.08] px-4 py-3 text-sm font-semibold text-rose-100 outline-none transition-colors hover:bg-rose-400/[0.13] focus-visible:ring-2 focus-visible:ring-rose-200/60 disabled:opacity-40">수정 요청 보내기</button>}</section>
    {decisionNotice && <p role="status" className="rounded-lg bg-black/20 px-3 py-2 text-xs text-emerald-200">{decisionNotice}</p>}
    {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
    </div>
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
