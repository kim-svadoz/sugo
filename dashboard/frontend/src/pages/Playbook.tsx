import { useState } from "react";
import type { ReactNode } from "react";
import { ArchiveRestore, CheckCircle2, ClipboardCheck, FileCode2, GitBranch, PackageCheck, Settings2, ShieldCheck, type LucideIcon } from "lucide-react";
import { useDashboardMeta } from "../hooks/useDashboardMeta.js";
import { cn } from "../lib/utils.js";

type StageId = "install" | "rules" | "spec" | "review" | "patch" | "lifecycle";
type Stage = { id: StageId; order: string; label: string; eyebrow: string; title: string; outcome: string; icon: LucideIcon };

const STAGES: Stage[] = [
  { id: "install", order: "01", label: "설치와 등록", eyebrow: "COLD START", title: "빈 환경에서도 같은 시작점", outcome: "등록을 반복해도 결과가 달라지지 않습니다.", icon: PackageCheck },
  { id: "rules", order: "02", label: "규칙 적용", eyebrow: "SHARED CONTEXT", title: "Claude와 Codex가 같은 규칙을 읽습니다", outcome: "도구가 달라도 프로젝트 판단 기준은 하나입니다.", icon: Settings2 },
  { id: "spec", order: "03", label: "SPEC에서 개발", eyebrow: "CONTROLLED DELIVERY", title: "요구사항을 실행 가능한 작업으로 전환", outcome: "단계를 건너뛰지 않고 근거가 있어야 다음으로 갑니다.", icon: FileCode2 },
  { id: "review", order: "04", label: "근거 검토", eyebrow: "HUMAN DECISION", title: "승인 요청보다 검토 자료가 먼저", outcome: "요약·REQ·검증·diff를 본 뒤 사람이 결정합니다.", icon: ClipboardCheck },
  { id: "patch", order: "05", label: "후속 개발", eyebrow: "LINEAGE", title: "완료 이력은 고정하고 후속 변경은 이어서", outcome: "원본 결과를 덮지 않고 patch 차수로 축적합니다.", icon: GitBranch },
  { id: "lifecycle", order: "06", label: "운영과 제거", eyebrow: "CLEAN LIFECYCLE", title: "설치와 제거의 경계를 명확하게", outcome: "비활성 보관, 복구, 완전 삭제를 의도대로 선택합니다.", icon: ArchiveRestore },
];

function Fact({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  return <div className="grid grid-cols-[132px_1fr] gap-5 border-b border-[var(--color-border)]/70 py-3 last:border-b-0"><span className="font-mono text-[10.5px] uppercase tracking-[.12em] text-[var(--color-text-dim)]">{label}</span><span className={cn("text-[13px] leading-relaxed", tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : "text-[var(--color-text)]")}>{value}</span></div>;
}

function Command({ children }: { children: string }) {
  return <code className="block overflow-x-auto border-l-2 border-cyan-400 bg-[var(--color-background)] px-4 py-3 font-mono text-[12px] text-cyan-200">{children}</code>;
}

function Install() {
  return <div className="grid gap-8 lg:grid-cols-2"><div className="space-y-3"><Command>claude plugin marketplace add kim-svadoz/sugo</Command><Command>claude plugin install sugo@sugo-marketplace</Command><Command>/reload-plugins · /sugo:version</Command><p className="pt-2 text-[12px] leading-relaxed text-[var(--color-text-muted)]">배포 번들만으로 실행됩니다. Console이나 데이터베이스가 없어도 로컬 파이프라인을 시작할 수 있습니다.</p></div><div><Fact label="FIRST RUN" value="빈 HOME과 node_modules 없는 배포 형태에서 MCP 핵심 경로 검증"/><Fact label="REGISTER" value="Workspace와 프로젝트 등록을 멱등하게 합성"/><Fact label="PLATFORM" value="Windows · macOS · Linux 경로와 사용자 로컬 시간대 적용"/><Fact label="RESULT" value="같은 입력은 같은 관리 경계와 산출물 구조를 만듭니다." tone="good"/></div></div>;
}

function Rules() {
  return <div className="grid gap-8 lg:grid-cols-2"><div><div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3"><span className="text-[13px] font-semibold text-[var(--color-text-bright)]">공통 정책 정본</span><span className="font-mono text-[11px] text-cyan-300">AGENTS.md</span></div><div className="mt-4 space-y-3 font-mono text-[12px] text-[var(--color-text-muted)]">{["Codex → AGENTS.md 직접 로드", "Claude → CLAUDE.md의 @AGENTS.md import", "양쪽 → .claude/rules/** 재귀 규칙 적용"].map(x => <div key={x} className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-400"/>{x}</div>)}</div></div><div><Fact label="STACK" value="언어 · 프레임워크 · 빌드 도구를 감지해 필요한 하네스만 선택"/><Fact label="DOMAIN" value="도메인 규칙 관리의 체크포인트를 프로젝트 규칙으로 동기화"/><Fact label="BOUNDARY" value="Sugo 관리 블록 밖의 사용자 설정은 수정하지 않음"/><Fact label="EFFECT" value="코드 생성과 검증이 같은 규칙을 사용합니다." tone="good"/></div></div>;
}

function Spec() {
  const pipeline = ["SPEC", "PRD", "BASELINE", "CODE", "TEST", "REVIEW", "DOCS", "DONE"];
  return <div className="space-y-7"><div className="flex flex-wrap gap-1.5">{pipeline.map((x, i) => <span key={x} className={cn("rounded-md border px-2.5 py-1.5 font-mono text-[10.5px]", i < 6 ? "border-cyan-500/35 bg-cyan-500/8 text-cyan-200" : "border-[var(--color-border)] text-[var(--color-text-dim)]")}>{x}</span>)}</div><div className="grid gap-8 lg:grid-cols-2"><div><Fact label="DRAFT" value="Schedule의 기획 이미지 · 문서 링크 · 작업 컨텍스트"/><Fact label="SPEC" value="<HOME>/.claude/sugo/specs/YYYYMMDD/<slug>/vN/spec.md"/><Fact label="FEATURE" value="<project>/sugo/features/YYYYMMDD/<slug>/prd.md"/></div><div><Fact label="VERSION" value="다시 작성하면 기존 파일을 덮지 않고 다음 vN 생성"/><Fact label="TIME" value="날짜 경계는 실행 사용자의 로컬 시간대 기준"/><Fact label="GATE" value="필수 섹션 · REQ · 증거가 없으면 다음 상태 전이를 차단" tone="warn"/></div></div></div>;
}

function Review() {
  const evidence = [["작업 결과 요약", "무엇을 바꿨고 사용자 가치가 무엇인지"], ["REQ 충족 상태", "요구사항별 완료 · 미완료 · 판단 필요"], ["검증 증거", "명령 · 결과 · 런타임 · 계약 · 남은 위험"], ["변경 파일", "실제 본문과 기준점이 있는 diff"]];
  return <div className="grid gap-8 lg:grid-cols-[1fr_320px]"><div className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">{evidence.map(([title, detail], i) => <div key={title} className="grid grid-cols-[34px_155px_1fr] items-center gap-3 py-3"><span className="font-mono text-[11px] text-cyan-300">0{i + 1}</span><span className="text-[13px] font-semibold text-[var(--color-text-bright)]">{title}</span><span className="text-[12px] text-[var(--color-text-muted)]">{detail}</span></div>)}</div><div className="border-l border-[var(--color-border)] pl-6"><div className="font-mono text-[10px] uppercase tracking-[.15em] text-amber-300">review_done gate</div><p className="mt-3 text-[14px] leading-relaxed text-[var(--color-text)]">검토 자료를 먼저 게시합니다. 사용자는 독립 HTML 보고서를 연 뒤 <b>확인, 진행</b>하거나 수정 내용을 저장해 재개합니다.</p><div className="mt-4 inline-flex items-center gap-2 rounded-md border border-emerald-500/35 bg-emerald-500/8 px-3 py-2 font-mono text-[11px] text-emerald-300"><ShieldCheck size={14}/> evidence before approval</div></div></div>;
}

function Patch() {
  return <div className="grid gap-8 lg:grid-cols-2"><div className="relative space-y-2 border-l border-violet-500/40 pl-6">{["FEAT · 캐릭터 단건조회", "PATCH 1 · 404 계약 보강", "PATCH 2 · ETag 캐시 정책"].map((x, i) => <div key={x} className="relative py-2"><span className={cn("absolute -left-[29px] top-3.5 h-2 w-2 rounded-full ring-4 ring-[var(--color-surface)]", i ? "bg-violet-400" : "bg-cyan-400")}/><div className="font-mono text-[10px] text-[var(--color-text-dim)]">{i ? `REVISION 0${i}` : "ORIGINAL"}</div><div className="mt-0.5 text-[13px] text-[var(--color-text-bright)]">{x}</div></div>)}</div><div><Fact label="IMMUTABLE" value="완료된 feat의 요약 · 변경 파일 · 검증 결과는 후속 작업으로 바꾸지 않음"/><Fact label="PATCH" value="PRD-patch-vN과 work-result-patch-vN을 새 차수에 기록"/><Fact label="MEMORY" value="도메인 규칙과 판단 배경은 체크포인트로 다음 세션에 전달"/><Fact label="CONSOLE" value="AI 작업 현황에서 차수별 결과와 파일을 분리해 확인" tone="good"/></div></div>;
}

function Lifecycle() {
  const items = [["UPDATE", "update + reload", "새 버전을 적용하고 기존 관리 데이터를 이어서 사용합니다."], ["UNINSTALL", "비활성 보관", "훅·명령·설정 영향은 제거하고 복구 가능한 데이터만 제품 경계 밖에 둡니다."], ["PURGE", "완전 삭제", "명시적으로 요청할 때 보관 데이터까지 삭제해 설치 전 상태로 돌아갑니다."]];
  return <div className="grid gap-6 md:grid-cols-3">{items.map(([label, title, body], i) => <div key={label} className="border-t border-[var(--color-border)] pt-4"><div className={cn("font-mono text-[10px] tracking-[.14em]", i === 1 ? "text-amber-300" : i === 2 ? "text-rose-300" : "text-cyan-300")}>{label}</div><h3 className="mt-2 text-[15px] font-semibold text-[var(--color-text-bright)]">{title}</h3><p className="mt-2 text-[12px] leading-relaxed text-[var(--color-text-muted)]">{body}</p></div>)}</div>;
}

const CONTENT: Record<StageId, () => ReactNode> = { install: Install, rules: Rules, spec: Spec, review: Review, patch: Patch, lifecycle: Lifecycle };

/** 실제 사용자 데이터를 읽지 않는 100% 시뮬레이션 화면이다. */
export function Playbook() {
  const [activeId, setActiveId] = useState<StageId>("install");
  const { pluginVersion } = useDashboardMeta();
  const active = STAGES.find(x => x.id === activeId) ?? STAGES[0];
  const Content = CONTENT[active.id];
  return <div className="mx-auto w-full max-w-[1680px] pb-10"><header className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-border)] pb-6"><div><div className="mb-2 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[.18em] text-cyan-300"><span className="h-px w-7 bg-cyan-400"/>PRODUCT OPERATING GUIDE</div><h1 className="text-[30px] font-semibold tracking-[-.03em] text-[var(--color-text-bright)]">Sugo 플레이북</h1><p className="mt-2 text-[13px] text-[var(--color-text-muted)]">설치부터 근거 검토, 후속 개발, 제거까지 실제 제품 수명주기를 따라갑니다.</p></div><span className="shrink-0 font-mono text-[11px] text-[var(--color-text-dim)]">PLUGIN {pluginVersion ? `v${pluginVersion}` : "—"} · SIMULATION</span></header><div className="grid min-w-0 gap-7 xl:grid-cols-[250px_minmax(0,1fr)]"><nav aria-label="Sugo 제품 수명주기" className="border-b border-[var(--color-border)] pb-5 xl:border-r xl:border-b-0 xl:pr-5 xl:pb-0"><div role="tablist" aria-orientation="vertical" className="grid grid-cols-2 gap-1 sm:grid-cols-3 xl:block xl:space-y-1">{STAGES.map(stage => { const Icon = stage.icon; const selected = stage.id === active.id; return <button key={stage.id} role="tab" aria-selected={selected} aria-controls={`playbook-panel-${stage.id}`} id={`playbook-tab-${stage.id}`} onClick={() => setActiveId(stage.id)} className={cn("flex w-full items-center gap-2 rounded-md px-2.5 py-2.5 text-left transition-colors xl:gap-3 xl:px-3 xl:py-3", selected ? "bg-cyan-500/10 text-[var(--color-text-bright)]" : "text-[var(--color-text-muted)] hover:bg-[var(--color-background)] hover:text-[var(--color-text)]")}><span className={cn("font-mono text-[10px]", selected ? "text-cyan-300" : "text-[var(--color-text-dim)]")}>{stage.order}</span><Icon size={15} className={selected ? "text-cyan-300" : "text-[var(--color-text-dim)]"}/><span className="text-[12px] font-medium xl:text-[13px]">{stage.label}</span></button>})}</div></nav><section role="tabpanel" id={`playbook-panel-${active.id}`} aria-labelledby={`playbook-tab-${active.id}`} className="min-w-0 px-1 py-1"><div className="mb-7 max-w-4xl"><div className="font-mono text-[10px] uppercase tracking-[.18em] text-cyan-300">{active.eyebrow}</div><h2 className="mt-2 text-[25px] font-semibold tracking-[-.025em] text-[var(--color-text-bright)]">{active.title}</h2><p className="mt-2 text-[14px] text-[var(--color-text-muted)]">{active.outcome}</p></div><Content/></section></div></div>;
}
