import { ExternalLink, FileDiff } from "lucide-react";
import { revisionRequestText, type ReviewRound } from "../lib/reviewConfirmation.js";

export function ReviewRoundHistory({ rounds, pendingRound, selectedRound, onOpenReport, onOpenFiles }: {
  rounds: ReviewRound[];
  pendingRound?: number;
  selectedRound?: number | null;
  onOpenReport: (round: ReviewRound) => void;
  onOpenFiles: (round: number | null) => void;
}) {
  if (rounds.length === 0) return null;
  return <section aria-label="검토 회차" className="rounded-lg border border-white/10 bg-black/10 p-3">
    <h4 className="text-[11px] font-semibold text-slate-200">검토 회차</h4>
    <ol className="mt-2 space-y-2">
      {rounds.map((round) => {
        const revised = round.decision === "revise";
        const request = revised ? revisionRequestText(round.response) : "";
        return <li key={round.round} className={`rounded-lg border px-3 py-2.5 ${selectedRound === round.round ? "border-cyan-400/35 bg-cyan-400/[0.05]" : "border-white/[0.07] bg-black/15"}`}>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] font-semibold text-slate-100">{round.round}차</span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${revised ? "border-rose-300/25 bg-rose-400/[0.08] text-rose-200" : "border-emerald-300/25 bg-emerald-400/10 text-emerald-200"}`}>{revised ? "수정 요청" : "승인"}</span>
            <span className="ml-auto flex gap-1.5">
              <button type="button" onClick={() => onOpenReport(round)} className="inline-flex items-center gap-1 rounded-md border border-violet-300/20 px-2 py-1 text-[10.5px] text-violet-100 hover:bg-violet-400/10"><ExternalLink size={11} />보고서</button>
              <button type="button" onClick={() => onOpenFiles(round.round)} className="inline-flex items-center gap-1 rounded-md border border-cyan-300/20 px-2 py-1 text-[10.5px] text-cyan-100 hover:bg-cyan-400/10"><FileDiff size={11} />변경 파일 {round.reviewPacket.files?.length ?? 0}</button>
            </span>
          </div>
          {request && <p className="mt-1.5 whitespace-pre-line text-[11.5px] leading-relaxed text-slate-300">{request}</p>}
        </li>;
      })}
      {pendingRound && <li className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 ${selectedRound === null ? "border-cyan-400/35 bg-cyan-400/[0.05]" : "border-amber-300/20 bg-amber-300/[0.04]"}`}>
        <span className="font-mono text-[11px] font-semibold text-slate-100">{pendingRound}차</span>
        <span className="rounded-full border border-amber-300/25 bg-amber-300/[0.07] px-2 py-0.5 text-[10px] font-semibold text-amber-200">확인 대기</span>
        <button type="button" onClick={() => onOpenFiles(null)} className="ml-auto inline-flex items-center gap-1 rounded-md border border-cyan-300/20 px-2 py-1 text-[10.5px] text-cyan-100 hover:bg-cyan-400/10"><FileDiff size={11} />변경 파일</button>
      </li>}
    </ol>
  </section>;
}
