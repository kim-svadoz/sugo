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
  const names: Record<string, string> = { evidenceResnapshot: "테스트 제외 후 재검증", environmentAbsent: "검증 환경 없음", runtimeUnverified: "실행 검증 생략", wiringUnverified: "연결 검증 생략", bootUnverified: "기동 검증 생략", contractEvidenceMissing: "계약 테스트 증거 없음", abandonedChain: "이전 작업 취소", todoSpecSyncSkipped: "설계 동기화 생략" };
  return <section id="completion-review" className="space-y-3 text-xs">
    <div className="space-y-2">
      <h3 className="font-semibold text-amber-200">{report.completionGrade === "unverified" ? "미검증 사유" : "검증 사유 및 사람 승인 기록"}</h3>
      <p className="text-[var(--color-text-muted)] leading-relaxed">{report.completionGrade === "unverified" ? "REQ 완료와 테스트 통과가 기록되어도, 아래 검증 예외(우회 라벨)가 남아 있어 미검증입니다. 각 사유를 검토하고 승인할 수 있습니다." : "REQ 진행률과 별도로 실행 증거와 검증 예외의 승인 여부로 등급을 판단합니다."}</p>
      {!labels.length && <p className="opacity-60">{report.bypassLabels ? "우회 라벨 없음" : "이전 플러그인의 기록입니다. 최신 플러그인에서 라벨을 동기화해야 승인할 수 있습니다."}</p>}
      {labels.map((l, index) => {
        const id = completionLabelId(l); const event = latest.get(id);
        const prior = (l.kind === "evidenceResnapshot" && !!l.supersededAt && (l.supersededByCycle ?? 0) > (l.implementationCycle ?? 0)) || l.patchVersion !== report.patchVersion;
        const approved = event?.action === "approve";
        return <div key={`${id}-${index}`} className="space-y-2 border-t border-white/10 pt-2">
          <p className="font-semibold">{names[l.kind] ?? l.kind}{prior ? " · 이전 사이클/패치 라벨 (등급 제외)" : approved ? " · 사람 승인" : " · 미승인"}</p>
          <p className="whitespace-pre-wrap break-words leading-relaxed">{l.reason}</p><details className="opacity-60"><summary>원래 라벨 확인</summary><code>{l.kind}</code></details>
          {l.supersededAt && <p className="opacity-60">재검증으로 해소: {l.supersededAt}</p>}
          {event && <p className="whitespace-pre-wrap text-violet-200">{event.userId} · {event.at}<br />{event.reason}</p>}
          {!prior && node.status === "done" && result?.approvalResultKey && <>
            <textarea aria-label={`${l.kind} ${approved ? "승인 취소" : "승인"} 사유`} placeholder="사람이 검토한 사유 (필수)" value={reasons[id] ?? ""} onChange={e => setReasons(r => ({ ...r, [id]: e.target.value }))} className="w-full rounded border border-white/20 bg-black/20 p-2" />
            <button disabled={busy || !(reasons[id] ?? "").trim()} onClick={() => void change(id, approved ? "revoke" : "approve")} className="rounded border border-violet-400/40 px-3 py-1 disabled:opacity-40">{approved ? "사람 승인 취소" : "사람 승인"}</button>
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
