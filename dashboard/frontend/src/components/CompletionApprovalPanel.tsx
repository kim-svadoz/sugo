import { completionReasonPresentation } from "./completionReasonPresentation.js";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch, apiJson } from "../api/client.js";
import { parseWorkResult, type CompletionLabel, type HumanApprovalEvent, type RoadmapNode } from "../hooks/useRoadmap.js";

export const completionLabelId = (l: CompletionLabel): string => JSON.stringify([l.kind, l.reason, l.patchVersion, l.recordedAt, l.implementationCycle ?? 0]);
export function CompletionApprovalPanel({ workspace, node, onChanged }: { workspace: string; node: RoadmapNode; onChanged: () => void }) {
  const result = parseWorkResult(node.work_result);
  const report = result?.report;
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HumanApprovalEvent[]>([]);
  useEffect(() => {
    setReasons({}); setError(""); setHistory([]);
    if (node.level !== "task" || !report) return;
    let alive = true;
    void apiJson<{ events: HumanApprovalEvent[] }>(`/api/workspaces/${encodeURIComponent(workspace)}/roadmap/completion-approval-history?nodeId=${encodeURIComponent(node.id)}`)
      .then(r => { if (alive) setHistory(r.events); }).catch(() => { if (alive) setError("승인 이력을 가져오지 못했습니다."); });
    return () => { alive = false; };
  }, [workspace, node.id, result?.approvalResultKey, report?.humanApprovals?.length]);
  useEffect(() => { setOpen(false); }, [workspace, node.id]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (!busy) setOpen(false); }
      if (event.key === "Tab") {
        const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]') ?? []);
        const first = items[0]; const last = items[items.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", handleKey, true);
    return () => { document.removeEventListener("keydown", handleKey, true); (previous?.isConnected ? previous : openerRef.current)?.focus(); };
  }, [open, busy]);
  async function change(labelId: string, action: "approve" | "revoke") {
    setBusy(true); setError("");
    try {
      const response = await apiFetch(`/api/workspaces/${encodeURIComponent(workspace)}/roadmap/completion-approval`, {
        method: "POST", body: JSON.stringify({ nodeId: node.id, resultKey: result?.approvalResultKey, labelId, action, reason: reasons[labelId] ?? "" }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { message?: string; error?: string };
        throw new Error(body.message ?? (response.status === 409 ? "작업 결과나 라벨이 변경됐습니다. 화면을 새로고침하고 다시 검토하세요." : body.error ?? `승인 변경 실패 (${response.status})`));
      }
      setReasons({}); onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : "승인 변경 실패"); }
    finally { setBusy(false); }
  }
  if (node.level !== "task" || !report) return null;
  const labels = report.bypassLabels ?? [];
  const latest = new Map((report.humanApprovals ?? []).map(e => [e.labelId, e]));
  const isPrior = (l: CompletionLabel) => (l.kind === "evidenceResnapshot" && !!l.supersededAt && (l.supersededByCycle ?? 0) > (l.implementationCycle ?? 0)) || l.patchVersion !== report.patchVersion;
  const pending = labels.filter(l => !isPrior(l) && latest.get(completionLabelId(l))?.action !== "approve").length;
  const ordered = [...labels].sort((a, b) => Number(isPrior(a)) - Number(isPrior(b)) || Number(latest.get(completionLabelId(a))?.action === "approve") - Number(latest.get(completionLabelId(b))?.action === "approve"));
  return <section id="completion-review" className="space-y-2 text-[13px] leading-6">
    <div className="flex items-center justify-between gap-3">
      <div><h3 className="font-semibold text-amber-200">{report.completionGrade === "unverified" ? "미검증 사유" : "사람 검토 기록"}</h3><p className="text-[12px] text-[var(--color-text-muted)]">{pending > 0 ? `사람 검토 ${pending}건 남음` : labels.length ? "미승인 사유 없음" : report.bypassLabels ? "검증 예외 없음" : "사유 기록 동기화 필요"}</p></div>
      {(labels.length > 0 || report.completionGrade === "unverified") && <button ref={openerRef} data-review-open type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 font-semibold text-amber-100">사유 검토</button>}
    </div>
    {!!node.runtime_assessment?.blockers?.length && <p className="text-[11px] text-[var(--color-text-muted)]">참고용 경고 {node.runtime_assessment.blockers.length}건 · 등급과 별개</p>}
    {open && createPortal(<div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4" onClick={() => { if (!busy) setOpen(false); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="completion-review-title" tabIndex={-1} className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[var(--color-surface)] shadow-2xl outline-none" onClick={e => e.stopPropagation()}>
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-6 py-4"><div><h2 id="completion-review-title" className="text-lg font-semibold">검증 사유 검토</h2><p className="mt-1 text-sm text-[var(--color-text-muted)]">{node.title}</p></div><button type="button" aria-label="검토 창 닫기" disabled={busy} onClick={() => setOpen(false)} className="rounded-lg border border-white/15 px-3 py-1.5 text-sm disabled:opacity-40">닫기</button></header>
        <div className="overflow-y-auto space-y-4 px-6 py-5 text-[14px] leading-6">

    <div className="space-y-2">
      <p className="font-semibold text-amber-200">{report.completionGrade === "unverified" ? "검증 대기" : "승인 기록"}</p>
      {report.completionGrade === "unverified" && pending > 0 && <div className="rounded-lg border border-amber-400/30 bg-amber-400/[0.07] px-3 py-2.5">
        <p className="font-semibold text-amber-100">사람이 검토할 사유 {pending}건이 남았습니다</p>
        <p className="mt-1 text-[var(--color-text)]">코드 작업과 REQ 체크는 끝났어도, 아래 검증 예외가 해소되지 않아 TASK는 아직 완료가 아닙니다.</p>
        <p className="mt-1 text-[var(--color-text-muted)]">각 항목의 기록과 작업 결과를 확인하세요. 승인할 근거가 부족하면 재검증이 필요합니다.</p>
      </div>}
      {!labels.length && <p className="opacity-60">{report.bypassLabels ? "우회 라벨 없음" : "이전 플러그인의 기록입니다. 최신 플러그인에서 라벨을 동기화해야 승인할 수 있습니다."}</p>}
      {ordered.map((l, index) => {
        const id = completionLabelId(l); const event = latest.get(id);
        const prior = isPrior(l);
        const explanation = completionReasonPresentation(l.kind);
        const approved = event?.action === "approve";
        return <div key={`${id}-${index}`} className={`space-y-3 rounded-xl border p-3 ${prior ? "border-white/10 opacity-70" : approved ? "border-violet-400/30 bg-violet-400/[0.03]" : "border-amber-400/30 bg-black/15"}`}>
          <div className="flex items-start justify-between gap-2"><h4 className="font-semibold text-[14px] leading-6 text-[var(--color-text-bright)]">{explanation.title}</h4><span className={`shrink-0 rounded px-2 text-[11px] ${prior ? "bg-white/5" : approved ? "bg-violet-400/10 text-violet-200" : "bg-amber-400/10 text-amber-200"}`}>{prior ? "등급 제외" : approved ? "승인됨" : "검토 필요"}</span></div>
          {!prior && !approved && <><p className="text-[var(--color-text)]">{explanation.meaning}</p><details className="rounded-lg bg-cyan-400/[0.04] px-3 py-2"><summary className="cursor-pointer font-semibold text-cyan-200">검토 안내</summary><p className="mt-1 text-[var(--color-text)]">{explanation.review}</p></details></>}
          <div className="rounded-lg border border-white/10 bg-black/10 px-4 py-3"><p className="text-xs font-semibold text-[var(--color-text-muted)]">작업 당시 기록 · 원문</p><p className="mt-2 whitespace-pre-wrap break-words leading-7">{l.reason}</p><details className="mt-2 text-[11px] text-[var(--color-text-muted)]"><summary className="cursor-pointer">기록 정보</summary><p>기록 당시의 사유입니다. 현재 코드에 적용되는지는 검토가 필요합니다.</p><code>{l.kind}</code></details></div>
          {l.supersededAt && <p className="opacity-60">재검증으로 해소: {l.supersededAt}</p>}
          {event && <p className="whitespace-pre-wrap text-violet-200">{event.userId} · {event.at}<br />{event.reason}</p>}
          {!prior && node.status === "done" && result?.approvalResultKey && <>
            <label className="block font-semibold text-[12px] text-[var(--color-text)]" htmlFor={`approval-reason-${index}`}>{approved ? "승인 취소 사유" : "검토 결과와 승인 근거 (필수)"}</label>
            <textarea id={`approval-reason-${index}`} aria-label={`${l.kind} ${approved ? "승인 취소" : "승인"} 사유`} placeholder={approved ? "승인을 되돌리는 이유를 적어주세요" : "무엇을 확인했고, 이 예외를 승인해도 되는지 적어주세요"} rows={3} value={reasons[id] ?? ""} onChange={e => setReasons(r => ({ ...r, [id]: e.target.value }))} className="w-full rounded-lg border border-white/25 bg-black/20 p-3 text-[13px] leading-6 focus:border-violet-400/60" />
            <button disabled={busy || !(reasons[id] ?? "").trim()} onClick={() => void change(id, approved ? "revoke" : "approve")} className="w-full rounded-lg border border-violet-400/50 bg-violet-400/10 px-3 py-2 font-semibold text-violet-100 disabled:opacity-40">{approved ? "사람 승인 취소" : "사람 승인"}</button>
            {!(reasons[id] ?? "").trim() && <p className="text-[11px] text-[var(--color-text-muted)]">사유를 입력하면 버튼이 활성화됩니다.</p>}
          </>}
        </div>;
      })}
      <p className="opacity-60">모든 미승인 사유를 승인하면 ‘사람 승인 검증완료’가 됩니다. 자동 검증완료와 구분되며 승인자·시각·사유가 기록됩니다.</p>
      {error && <p role="alert" className="text-rose-300">{error}</p>}
    </div>
    {!!node.runtime_assessment?.blockers?.length && <div className="rounded-xl border border-white/10 p-3"><h3 className="font-semibold">참고용 경고 · 완료등급과 별개</h3>{node.runtime_assessment.blockers.map((b, i) => <p key={i} className="mt-2 whitespace-pre-wrap">{b}</p>)}</div>}
    {!!history.length && <details className="rounded-xl border border-white/10 p-3"><summary>사람 승인 감사 기록 ({history.length})</summary>{history.map((e, i) => <div key={i} className="mt-2 whitespace-pre-wrap break-words border-t border-white/10 pt-2">{e.action === "approve" ? "승인" : "승인 취소"} · {e.userId} · {e.at}<br />[{e.kind}] {e.originalReason}<br />{e.reason}<br />{e.workResultPath}</div>)}</details>}
        </div>
      </div>
    </div>, document.body)}
  </section>;
}
