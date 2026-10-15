import { useState, type ReactNode } from "react";
import {
  Blocks,
  CheckCircle2,
  ClipboardCheck,
  FileCode2,
  GitBranch,
  Radar,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useDashboardMeta } from "../hooks/useDashboardMeta.js";
import { cn } from "../lib/utils.js";

type StageId = "intent" | "context" | "delivery" | "review" | "lineage" | "operations";
type Stage = { id: StageId; order: string; label: string; eyebrow: string; title: string; outcome: string; icon: LucideIcon };

const STAGES: Stage[] = [
  { id: "intent", order: "01", label: "의도를 SPEC으로", eyebrow: "FROM IDEA TO CONTRACT", title: "흩어진 기획을 구현 가능한 계약으로", outcome: "개발을 시작하기 전에 목표·범위·판단 기준을 같은 문서에 고정합니다.", icon: FileCode2 },
  { id: "context", order: "02", label: "맥락을 규칙으로", eyebrow: "CONTEXT THAT SURVIVES", title: "코드 밖의 팀 판단을 다음 세션까지", outcome: "기술 표준과 도메인 지식을 에이전트가 매번 같은 기준으로 읽습니다.", icon: Blocks },
  { id: "delivery", order: "03", label: "작업을 통제하며", eyebrow: "CONTROLLED DELIVERY", title: "큰 요청을 검증 가능한 단위로 끝까지", outcome: "AI가 단계를 건너뛰거나 완료를 자기 선언하지 못하게 작업과 증거를 연결합니다.", icon: ShieldCheck },
  { id: "review", order: "04", label: "근거로 판단하기", eyebrow: "HUMAN DECISION", title: "승인 요청보다 검토 자료가 먼저", outcome: "무엇이 달라졌고 무엇이 검증됐는지 본 뒤 사람이 다음 행동을 결정합니다.", icon: ClipboardCheck },
  { id: "lineage", order: "05", label: "변경을 이어가기", eyebrow: "CONTINUOUS LINEAGE", title: "완료된 결과를 보존하며 다음 변경으로", outcome: "후속 개발이 이전 결과를 덮지 않고 이유와 차수까지 하나의 계보로 남습니다.", icon: GitBranch },
  { id: "operations", order: "06", label: "제품까지 추적하기", eyebrow: "CODE TO PRODUCTION", title: "개발 완료와 실제 배포 사이의 간격까지", outcome: "작업·코드·배포 상태를 같은 SPEC 기준으로 연결해 지금 어디까지 갔는지 확인합니다.", icon: Radar },
];

function Fact({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  return (
    <div className="grid grid-cols-[116px_minmax(0,1fr)] gap-5 border-b border-[var(--color-border)]/70 py-3 last:border-b-0">
      <span className="font-mono text-[10px] uppercase tracking-[.12em] text-[var(--color-text-dim)]">{label}</span>
      <span className={cn("text-[13px] leading-relaxed", tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : "text-[var(--color-text)]")}>{value}</span>
    </div>
  );
}

function Flow({ steps }: { steps: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {steps.map((step, index) => (
        <div key={step} className="flex items-center gap-1.5">
          <span className="rounded border border-cyan-500/30 bg-cyan-500/8 px-2.5 py-1.5 font-mono text-[10.5px] text-cyan-200">{step}</span>
          {index < steps.length - 1 && <span className="text-[var(--color-text-dim)]">→</span>}
        </div>
      ))}
    </div>
  );
}

function Intent() {
  return (
    <div className="space-y-7">
      <Flow steps={["기획 자료", "SPEC", "REQ", "feat 준비"]} />
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <Fact label="INPUT" value="일정, 목표일, 대상 저장소, 작업 브랜치, 화면 캡처와 기획 문서 링크" />
          <Fact label="CLARIFY" value="모호한 범위와 사람만 결정할 수 있는 정책은 구현 전에 질문으로 분리" />
          <Fact label="CONTRACT" value="배경·목표·비목표·요구사항·검증 기준·제약·미결정을 갖춘 실행 가능한 SPEC" />
        </div>
        <div>
          <Fact label="VERSION" value="수정할 때 기존 원본을 덮지 않고 vN으로 보존" />
          <Fact label="HANDOFF" value="SPEC 재작성과 feat 시작을 서로 다른 다음 행동으로 제공" />
          <Fact label="VALUE" value="기획 시점과 구현 시점의 제품 간격을 개발 전에 드러냅니다." tone="good" />
        </div>
      </div>
    </div>
  );
}

function Context() {
  const sources = [
    ["기술 하네스", "언어·프레임워크·빌드 도구의 코딩 및 검증 기준"],
    ["도메인 규칙", "코드만으로 알 수 없는 정책·사고 이력·법무·운영 제약"],
    ["프로젝트 문맥", "저장소 구조, 현재 브랜치, 기존 구현과 변경 경계"],
  ];
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_.9fr]">
      <div className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
        {sources.map(([title, detail], index) => (
          <div key={title} className="grid grid-cols-[30px_130px_1fr] gap-3 py-3">
            <span className="font-mono text-[10px] text-cyan-300">0{index + 1}</span>
            <span className="text-[13px] font-semibold text-[var(--color-text-bright)]">{title}</span>
            <span className="text-[12px] leading-relaxed text-[var(--color-text-muted)]">{detail}</span>
          </div>
        ))}
      </div>
      <div>
        <Fact label="CLAUDE" value="CLAUDE.md의 @AGENTS.md 연결과 .claude/rules/** 적용" />
        <Fact label="CODEX" value="AGENTS.md와 같은 프로젝트 규칙을 직접 적용" />
        <Fact label="CHECKPOINT" value="Workspace 도메인 규칙을 연결된 프로젝트 전체에 동기화" />
        <Fact label="RESULT" value="세션과 실행 도구가 바뀌어도 판단 기준이 유지됩니다." tone="good" />
      </div>
    </div>
  );
}

function Delivery() {
  const agents = [
    ["code-agent", "REQ 단위 구현과 변경 범위"],
    ["test-agent", "신규·회귀 테스트와 실행 증거"],
    ["review-agent", "PRD 정합성·런타임·계약·위험"],
    ["docs-agent", "변경된 동작과 문서의 일치"],
  ];
  return (
    <div className="space-y-7">
      <Flow steps={["PRD", "BASELINE", "CONTRACT", "CODE", "TEST", "REVIEW", "DOCS"]} />
      <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          {agents.map(([name, role]) => <div key={name} className="border-t border-[var(--color-border)] py-3"><div className="font-mono text-[10px] text-cyan-300">{name}</div><div className="mt-1 text-[12px] text-[var(--color-text-muted)]">{role}</div></div>)}
        </div>
        <div>
          <Fact label="ORDER" value="현재 상태에서 허용된 다음 행동만 온톨로지가 제시" />
          <Fact label="EVIDENCE" value="테스트 이름·명령·결과·파일 지문을 저장된 기록과 대조" />
          <Fact label="BLOCK" value="근거가 없거나 불일치하면 상태 코드와 부족한 조건으로 차단" tone="warn" />
          <Fact label="VALUE" value="속도가 아니라 재현 가능한 완료를 만듭니다." tone="good" />
        </div>
      </div>
    </div>
  );
}

function Review() {
  const evidence = [
    ["작업 결과", "사용자 가치와 실제 변경 범위"],
    ["REQ", "요구사항별 충족·미충족·사람 판단"],
    ["검증", "테스트·런타임·계약·우회·남은 위험"],
    ["변경 파일", "기준점이 있는 실제 코드와 diff"],
  ];
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_330px]">
      <div className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
        {evidence.map(([title, detail], index) => <div key={title} className="grid grid-cols-[34px_130px_1fr] items-center gap-3 py-3"><span className="font-mono text-[10px] text-cyan-300">0{index + 1}</span><span className="text-[13px] font-semibold text-[var(--color-text-bright)]">{title}</span><span className="text-[12px] text-[var(--color-text-muted)]">{detail}</span></div>)}
      </div>
      <div className="border-l border-[var(--color-border)] pl-6">
        <div className="font-mono text-[10px] uppercase tracking-[.14em] text-amber-300">review_done gate</div>
        <p className="mt-3 text-[14px] leading-relaxed text-[var(--color-text)]">검토 자료를 먼저 게시합니다. 독립 HTML 보고서를 확인한 뒤 <b>확인, 진행</b>하거나 수정 내용을 저장해 같은 작업을 재개합니다.</p>
        <div className="mt-4 inline-flex items-center gap-2 rounded border border-emerald-500/35 bg-emerald-500/8 px-3 py-2 font-mono text-[10.5px] text-emerald-300"><CheckCircle2 size={14} /> 사람이 결정할 준비가 된 상태</div>
      </div>
    </div>
  );
}

function Lineage() {
  const history = ["FEAT · 검색 API 추가", "PATCH 1 · 예외 계약 보강", "PATCH 2 · 캐시 정책 적용"];
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="relative space-y-2 border-l border-violet-500/40 pl-6">
        {history.map((item, index) => <div key={item} className="relative py-2"><span className={cn("absolute -left-[29px] top-3.5 h-2 w-2 rounded-full ring-4 ring-[var(--color-surface)]", index ? "bg-violet-400" : "bg-cyan-400")} /><div className="font-mono text-[10px] text-[var(--color-text-dim)]">{index ? `REVISION 0${index}` : "ORIGINAL"}</div><div className="mt-0.5 text-[13px] text-[var(--color-text-bright)]">{item}</div><div className="mt-1 text-[11px] text-[var(--color-text-dim)]">요약 · REQ · 검증 · 변경 파일 독립 보존</div></div>)}
      </div>
      <div>
        <Fact label="IMMUTABLE" value="완료된 feat 결과는 다음 patch의 진행 상태로 바뀌지 않음" />
        <Fact label="COMPARE" value="차수별 의도와 구현 결과를 따로 열어 비교" />
        <Fact label="CANCEL" value="최신 시도를 취소해도 직전 유효 완료 상태와 시도 기록을 보존" />
        <Fact label="MEMORY" value="반복해서 생긴 판단은 도메인 규칙 체크포인트로 승격" tone="good" />
      </div>
    </div>
  );
}

function Operations() {
  const envs = [["LOCAL", "코드 산출물"], ["DEV", "개발 검증"], ["STG", "통합 검증"], ["PRD", "운영 배포"]];
  return (
    <div className="space-y-7">
      <div className="grid grid-cols-4 overflow-hidden rounded border border-[var(--color-border)]">
        {envs.map(([env, detail], index) => <div key={env} className={cn("border-r border-[var(--color-border)] px-3 py-3 last:border-r-0", index < 3 && "bg-cyan-500/5")}><div className={cn("font-mono text-[11px]", index < 3 ? "text-cyan-300" : "text-[var(--color-text-dim)]")}>{env}</div><div className="mt-1 text-[11px] text-[var(--color-text-muted)]">{detail}</div></div>)}
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <Fact label="SCHEDULE" value="미시작·진행·검토 필요·지난 미종료 SPEC을 작업 순서로 확인" />
          <Fact label="CANVAS" value="SPEC → Run → Task → REQ와 patch 계보, 작업 결과와 변경 파일을 탐색" />
          <Fact label="HISTORY" value="AI가 수행한 의미 있는 개발 결과와 설계 결정을 장기 기록" />
        </div>
        <div>
          <Fact label="RELEASE" value="작업 commit과 환경별 실제 실행 이미지를 비교해 배포 위치 판정" />
          <Fact label="GAP" value="파이프라인 DONE과 Git push·실제 배포 완료를 같은 뜻으로 취급하지 않음" tone="warn" />
          <Fact label="VALUE" value="코드가 끝난 시점이 아니라 제품에 도달한 지점을 확인합니다." tone="good" />
        </div>
      </div>
    </div>
  );
}

const CONTENT: Record<StageId, () => ReactNode> = { intent: Intent, context: Context, delivery: Delivery, review: Review, lineage: Lineage, operations: Operations };

/** 실제 사용자 데이터를 읽지 않는 100% 시뮬레이션 화면이다. */
export function Playbook() {
  const [activeId, setActiveId] = useState<StageId>("intent");
  const { pluginVersion } = useDashboardMeta();
  const active = STAGES.find((stage) => stage.id === activeId) ?? STAGES[0];
  const Content = CONTENT[active.id];
  return (
    <div className="mx-auto w-full max-w-[1680px] pb-10">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-border)] pb-6">
        <div><div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.18em] text-cyan-300"><span className="h-px w-7 bg-cyan-400" />AI DELIVERY PLAYBOOK</div><h1 className="text-[30px] font-semibold tracking-[-.03em] text-[var(--color-text-bright)]">AI 개발을 맡기고도 통제력을 잃지 않는 방법</h1><p className="mt-2 text-[13px] text-[var(--color-text-muted)]">요청을 명확히 만들고, 팀의 맥락을 적용하고, 근거를 확인하며 제품 배포까지 추적합니다.</p></div>
        <span className="shrink-0 font-mono text-[10.5px] text-[var(--color-text-dim)]">PLUGIN {pluginVersion ? `v${pluginVersion}` : "—"} · GUIDED SIMULATION</span>
      </header>
      <div className="grid min-w-0 gap-7 xl:grid-cols-[260px_minmax(0,1fr)]">
        <nav aria-label="AI 개발 사용 시나리오" className="border-b border-[var(--color-border)] pb-5 xl:border-r xl:border-b-0 xl:pr-5 xl:pb-0"><div role="tablist" aria-orientation="vertical" className="grid grid-cols-2 gap-1 sm:grid-cols-3 xl:block xl:space-y-1">{STAGES.map((stage) => { const Icon = stage.icon; const selected = stage.id === active.id; return <button key={stage.id} role="tab" aria-selected={selected} aria-controls={`playbook-panel-${stage.id}`} id={`playbook-tab-${stage.id}`} onClick={() => setActiveId(stage.id)} className={cn("flex w-full items-center gap-2 rounded px-2.5 py-2.5 text-left transition-colors xl:gap-3 xl:px-3 xl:py-3", selected ? "bg-cyan-500/10 text-[var(--color-text-bright)]" : "text-[var(--color-text-muted)] hover:bg-[var(--color-background)] hover:text-[var(--color-text)]")}><span className={cn("font-mono text-[10px]", selected ? "text-cyan-300" : "text-[var(--color-text-dim)]")}>{stage.order}</span><Icon size={15} className={selected ? "text-cyan-300" : "text-[var(--color-text-dim)]"} /><span className="text-[12px] font-medium xl:text-[13px]">{stage.label}</span></button>; })}</div></nav>
        <section role="tabpanel" id={`playbook-panel-${active.id}`} aria-labelledby={`playbook-tab-${active.id}`} className="min-w-0 px-1 py-1"><div className="mb-7 max-w-4xl"><div className="font-mono text-[10px] uppercase tracking-[.18em] text-cyan-300">{active.eyebrow}</div><h2 className="mt-2 text-[25px] font-semibold tracking-[-.025em] text-[var(--color-text-bright)]">{active.title}</h2><p className="mt-2 text-[14px] text-[var(--color-text-muted)]">{active.outcome}</p></div><Content /></section>
      </div>
    </div>
  );
}
