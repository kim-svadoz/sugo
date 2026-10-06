import { completionReasonPresentation, reasonPreview } from "./completionReasonPresentation.js";
import { useEffect, useState } from "react";
import { apiFetch, apiJson } from "../api/client.js";
import { parseWorkResult, type CompletionLabel, type HumanApprovalEvent, type RoadmapNode } from "../hooks/useRoadmap.js";

export const completionLabelId = (l: CompletionLabel): string => JSON.stringify([l.kind, l.reason, l.patchVersion, l.recordedAt, l.implementationCycle ?? 0]);
export function CompletionApprovalPanel({ workspace, node, onChanged }: { workspace: string; node: RoadmapNode; onChanged: () => void }) {
  const result = parseWorkResult(node.work_result);
  const report = result?.report;
  const [reasons, setReasons] = useState<Record<string, string>>({});
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
  return <section id="completion-review" className="space-y-4 text-[13px] leading-6">
    <div className="space-y-2">
      <h3 className="font-semibold text-amber-200">{report.completionGrade === "unverified" ? "미검증 사유" : "검증 사유 및 사람 승인 기록"}</h3>
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
          {!prior && !approved && <><p className="text-[var(--color-text)]">{explanation.meaning}</p><div className="rounded-lg bg-cyan-400/[0.04] px-3 py-2"><p className="text-[11px] font-semibold text-cyan-200">무엇을 확인해야 하나요?</p><p className="mt-1 text-[var(--color-text)]">{explanation.review}</p></div></>}
          <details className="rounded-lg border border-white/10 px-3 py-2">
            <summary className="cursor-pointer text-[var(--color-text)]"><span className="font-semibold">작업 당시 기록 · 원문 보기</span><span className="mt-1 block text-[12px] leading-5 text-[var(--color-text-muted)]">{reasonPreview(l.reason)}</span></summary>
            <p className="mt-3 whitespace-pre-wrap break-words border-t border-white/10 pt-3 leading-6">{l.reason}</p><p className="mt-2 text-[11px] text-[var(--color-text-muted)]">기록 당시의 사유입니다. 현재 코드에 적용되는지는 검토가 필요합니다.</p><code className="text-[11px]">{l.kind}</code>
          </details>
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
  </section>;
}
