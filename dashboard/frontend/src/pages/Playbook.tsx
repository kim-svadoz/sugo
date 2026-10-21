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
import { PageHeading } from "../components/PageHeading.js";
import { cn } from "../lib/utils.js";

type StageId = "intent" | "context" | "delivery" | "review" | "lineage" | "operations";
type Stage = { id: StageId; order: string; label: string; eyebrow: string; title: string; outcome: string; icon: LucideIcon };
type PipelineStep = { name: string; owner: string; proof: string };
type ConsoleCapability = { name: string; question: string; answer: string };

const STAGES: Stage[] = [
  { id: "intent", order: "01", label: "기획을 기능 명세로", eyebrow: "기획 정리", title: "흩어진 기획을 개발 기준으로 바꿉니다", outcome: "개발 전에 목표, 범위, 기능 요구사항, 확인 기준을 한 문서에 기록합니다.", icon: FileCode2 },
  { id: "context", order: "02", label: "팀의 판단을 규칙으로", eyebrow: "팀 지식 유지", title: "코드에 없는 판단도 다음 작업에 적용합니다", outcome: "AI는 기술 표준과 도메인 규칙을 같은 기준으로 읽습니다.", icon: Blocks },
  { id: "delivery", order: "03", label: "작업 단계 통제", eyebrow: "개발 순서 관리", title: "큰 요청을 확인 가능한 단위로 나눕니다", outcome: "AI는 필요한 근거를 기록해야 다음 단계로 이동할 수 있습니다.", icon: ShieldCheck },
  { id: "review", order: "04", label: "근거를 보고 판단", eyebrow: "사용자 검토", title: "승인을 요청하기 전에 검토 자료를 제공합니다", outcome: "사용자는 변경 내용과 검증 결과를 확인한 뒤 다음 행동을 결정합니다.", icon: ClipboardCheck },
  { id: "lineage", order: "05", label: "후속 변경 잇기", eyebrow: "개발 이력 유지", title: "완료된 결과를 보존하고 다음 변경을 잇습니다", outcome: "Sugo는 각 후속 변경의 이유, 결과, 검증 기록을 별도로 보존합니다.", icon: GitBranch },
  { id: "operations", order: "06", label: "Console로 운영 확인", eyebrow: "Sugo Console", title: "AI 작업을 운영 판단에 필요한 정보로 바꿉니다", outcome: "Console은 일정, 작업 근거, 개발 이력, 실제 배포 상태를 같은 기능 명세로 연결합니다.", icon: Radar },
];

const PIPELINE_STEPS: PipelineStep[] = [
  { name: "프로젝트 파악", owner: "INIT → SCAN", proof: "저장소 구조와 실행 환경을 확인합니다." },
  { name: "요구사항 확정", owner: "CLARIFY → PRD", proof: "질문으로 범위와 확인 기준을 확정합니다." },
  { name: "개발 준비", owner: "JIRA(선택) → READY", proof: "작업 경계와 실행 순서를 확정합니다." },
  { name: "기준 상태 확인", owner: "BASELINE", proof: "변경 전 테스트 결과를 기록합니다." },
  { name: "계약 테스트", owner: "CONTRACT → CODE_READY", proof: "구현 전에 실패하는 계약을 먼저 확인합니다." },
  { name: "구현", owner: "CODE_RUNNING → CODE_DONE", proof: "기능 요구사항별 변경과 분석 결과를 기록합니다." },
  { name: "테스트", owner: "TEST_RUNNING → TEST_DONE", proof: "새 테스트와 회귀 테스트의 실제 결과를 대조합니다." },
  { name: "독립 검토와 사용자 확인", owner: "REVIEW_RUNNING", proof: "명세, 계약, 실행 결과, 남은 위험을 확인합니다." },
  { name: "문서와 커밋", owner: "DOCS → COMMIT → DONE", proof: "검증된 동작과 기록을 함께 보존합니다." },
];

const CONSOLE_CAPABILITIES: ConsoleCapability[] = [
  { name: "일정", question: "지금 무엇을 해야 하는가?", answer: "준비, 진행, 검토 필요, 마감 경과 작업을 우선순위에 따라 보여줍니다." },
  { name: "AI 작업 현황", question: "AI는 지금 어디까지 했는가?", answer: "기능 명세부터 작업, 기능 요구사항, 후속 변경까지 한 구조로 보여줍니다." },
  { name: "검토 보고서", question: "무엇을 근거로 승인할 수 있는가?", answer: "변경 내용, 요구사항 충족 상태, 테스트, 실행 증거, 남은 위험을 모아 보여줍니다." },
  { name: "개발 이력", question: "완료된 작업에서 무엇을 남겼는가?", answer: "AI가 완료한 기능과 주요 설계 결정을 시간순으로 보존합니다." },
  { name: "배포 상태", question: "사용자는 어느 버전을 받고 있는가?", answer: "작업 커밋과 각 환경에서 실행 중인 이미지를 비교합니다." },
];

function Fact({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  return (
    <div className="grid grid-cols-[132px_minmax(0,1fr)] gap-5 border-b border-[var(--color-border)]/70 py-4 last:border-b-0">
      <span className="text-[12px] font-semibold text-[var(--color-text-muted)]">{label}</span>
      <span className={cn("text-[15px] leading-relaxed", tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : "text-[var(--color-text)]")}>{value}</span>
    </div>
  );
}

function Flow({ steps }: { steps: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {steps.map((step, index) => (
        <div key={step} className="flex items-center gap-1.5">
          <span className="rounded border border-cyan-500/30 bg-cyan-500/8 px-3 py-2 text-[13px] font-medium text-cyan-200">{step}</span>
          {index < steps.length - 1 && <span className="text-[var(--color-text-dim)]">→</span>}
        </div>
      ))}
    </div>
  );
}

function PipelineMap() {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[16px] font-semibold text-[var(--color-text-bright)]">실제 개발 파이프라인</h3>
        <span className="text-[13px] text-[var(--color-text-dim)]">각 단계는 실행 결과를 남기고 다음 단계에 전달합니다.</span>
      </div>
      <ol className="grid gap-x-6 gap-y-5 md:grid-cols-3">
        {PIPELINE_STEPS.map((step, index) => (
          <li key={step.name} className="relative border-t-2 border-cyan-500/45 pt-3 md:min-h-[138px]">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] text-cyan-300">{String(index + 1).padStart(2, "0")}</span>
              {index < PIPELINE_STEPS.length - 1 && <span aria-hidden="true" className={cn("text-[16px] text-[var(--color-text-dim)]", (index === 2 || index === 5) && "md:hidden")}>→</span>}
            </div>
            <div className="mt-2 text-[15px] font-semibold text-[var(--color-text-bright)]">{step.name}</div>
            <div className="mt-1 text-[12px] font-medium text-cyan-300/80">{step.owner}</div>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-text-muted)]">{step.proof}</p>
          </li>
        ))}
      </ol>
      <p className="mt-4 border-l-2 border-amber-400/50 pl-3 text-[13px] leading-relaxed text-amber-200">테스트나 검토에서 문제가 나오면 구현 단계로 돌아갑니다. 기존 결과를 덮지 않고 재검증 기록을 추가합니다.</p>
    </div>
  );
}

function Intent() {
  return (
    <div className="space-y-7">
      <Flow steps={["기획 자료", "기능 명세", "기능 요구사항", "첫 개발 준비"]} />
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <Fact label="입력 자료" value="일정, 목표일, 대상 저장소, 작업 브랜치, 화면 캡처, 기획 문서 링크를 모읍니다." />
          <Fact label="확인할 내용" value="범위가 모호하면 구현 전에 질문합니다. 사람만 결정할 수 있는 정책도 따로 표시합니다." />
          <Fact label="기능 명세" value="배경, 목표, 제외 범위, 기능 요구사항, 확인 기준, 제약, 미결정을 기록합니다." />
        </div>
        <div>
          <Fact label="버전 보존" value="기능 명세를 수정하면 기존 원본을 보존하고 새 버전을 만듭니다." />
          <Fact label="다음 행동" value="기능 명세 다시 작성과 첫 개발 시작을 별도 행동으로 제공합니다." />
          <Fact label="얻는 효과" value="기획과 현재 제품의 차이를 개발 전에 확인할 수 있습니다." tone="good" />
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
            <span className="font-mono text-[11px] text-cyan-300">0{index + 1}</span>
            <span className="text-[15px] font-semibold text-[var(--color-text-bright)]">{title}</span>
            <span className="text-[14px] leading-relaxed text-[var(--color-text-muted)]">{detail}</span>
          </div>
        ))}
      </div>
      <div>
        <Fact label="Claude" value="CLAUDE.md가 AGENTS.md와 프로젝트 규칙을 연결합니다." />
        <Fact label="Codex" value="AGENTS.md와 같은 프로젝트 규칙을 직접 읽습니다." />
        <Fact label="도메인 규칙" value="워크스페이스의 체크포인트를 연결된 프로젝트에 동기화합니다." />
        <Fact label="얻는 효과" value="세션과 AI 도구가 바뀌어도 같은 판단 기준을 적용합니다." tone="good" />
      </div>
    </div>
  );
}

function Delivery() {
  const agents = [
    { id: "code-agent", name: "구현 에이전트", role: "기능 요구사항 단위로 코드를 변경합니다." },
    { id: "test-agent", name: "테스트 에이전트", role: "새 테스트와 회귀 테스트를 실행하고 증거를 기록합니다." },
    { id: "review-agent", name: "검토 에이전트", role: "개발 명세, 실행 결과, 계약, 위험을 독립적으로 확인합니다." },
    { id: "docs-agent", name: "문서 에이전트", role: "변경된 동작과 설명 문서를 일치시킵니다." },
  ];
  return (
    <div className="space-y-7">
      <PipelineMap />
      <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
        <div>
          <div className="mb-3">
            <div className="text-[15px] font-semibold text-[var(--color-text-bright)]">각 단계는 별도의 AI 에이전트가 실행합니다.</div>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-text-muted)]">각 에이전트는 자신의 책임만 수행합니다. 작업 결과와 실행 증거를 다음 에이전트에 인계합니다.</p>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            {agents.map((agent) => <div key={agent.id} className="border-t border-[var(--color-border)] py-4"><div className="flex flex-wrap items-center gap-2"><span className="text-[13px] font-semibold text-cyan-300">{agent.name}</span><span className="rounded border border-violet-400/25 bg-violet-400/8 px-1.5 py-0.5 font-mono text-[10px] text-violet-200">{agent.id}</span></div><div className="mt-1.5 text-[14px] leading-relaxed text-[var(--color-text-muted)]">{agent.role}</div></div>)}
          </div>
        </div>
        <div>
          <Fact label="작업 순서" value="현재 상태에서 실행할 수 있는 다음 행동만 제시합니다." />
          <Fact label="실행 증거" value="저장된 실행 증거와 실제 결과를 비교합니다." />
          <Fact label="작업 차단" value="통과 조건이 없으면 다음 단계로 이동하지 않습니다. 부족한 조건도 표시합니다." tone="warn" />
          <Fact label="얻는 효과" value="다른 환경에서도 다시 확인할 수 있는 완료 기록을 만듭니다." tone="good" />
        </div>
      </div>
    </div>
  );
}

function Review() {
  const evidence = [
    ["작업 결과", "사용자 가치와 실제 변경 범위"],
    ["기능 요구사항", "각 요구사항의 충족, 미충족, 사용자 판단 상태"],
    ["검증", "테스트·런타임·계약·우회·남은 위험"],
    ["변경 파일", "기준점이 있는 실제 코드와 diff"],
  ];
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_330px]">
      <div className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
        {evidence.map(([title, detail], index) => <div key={title} className="grid grid-cols-[34px_145px_1fr] items-center gap-3 py-4"><span className="font-mono text-[11px] text-cyan-300">0{index + 1}</span><span className="text-[15px] font-semibold text-[var(--color-text-bright)]">{title}</span><span className="text-[14px] text-[var(--color-text-muted)]">{detail}</span></div>)}
      </div>
      <div className="border-l border-[var(--color-border)] pl-6">
        <div className="text-[12px] font-semibold text-amber-300">검토 완료 조건</div>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--color-text)]">Sugo는 검토 자료를 먼저 게시합니다. 사용자는 HTML 보고서를 확인합니다. 그다음 <b>확인, 진행</b>을 선택하거나 수정 내용을 저장합니다.</p>
        <div className="mt-4 inline-flex items-center gap-2 rounded border border-emerald-500/35 bg-emerald-500/8 px-3 py-2.5 text-[12px] font-medium text-emerald-300"><CheckCircle2 size={15} /> 사용자가 판단할 수 있는 상태</div>
      </div>
    </div>
  );
}

function Lineage() {
  const history = ["FEAT · 검색 API 추가", "PATCH 1 · 예외 계약 보강", "PATCH 2 · 캐시 정책 적용"];
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="relative space-y-2 border-l border-violet-500/40 pl-6">
        {history.map((item, index) => <div key={item} className="relative py-3"><span className={cn("absolute -left-[29px] top-4.5 h-2 w-2 rounded-full ring-4 ring-[var(--color-surface)]", index ? "bg-violet-400" : "bg-cyan-400")} /><div className="text-[11px] font-semibold text-[var(--color-text-dim)]">{index ? `후속 변경 ${index}` : "첫 개발"}</div><div className="mt-1 text-[15px] text-[var(--color-text-bright)]">{item}</div><div className="mt-1.5 text-[13px] text-[var(--color-text-dim)]">작업 요약 · 기능 요구사항 · 검증 결과 · 변경 파일을 별도로 보존합니다.</div></div>)}
      </div>
      <div>
        <Fact label="완료 결과 보존" value="첫 개발 결과는 후속 변경의 진행 상태로 바뀌지 않습니다." />
        <Fact label="차수별 비교" value="각 변경의 의도와 구현 결과를 따로 열어 비교합니다." />
        <Fact label="변경 취소" value="최신 변경을 취소해도 직전 완료 상태와 취소한 시도 기록을 보존합니다." />
        <Fact label="팀 지식 축적" value="반복해서 필요한 판단은 도메인 규칙 체크포인트로 등록합니다." tone="good" />
      </div>
    </div>
  );
}

function Operations() {
  const envs = [["로컬", "개발 코드"], ["개발 환경", "기능 확인"], ["통합 환경", "통합 확인"], ["운영 환경", "사용자 제공"]];
  return (
    <div className="space-y-7">
      <div className="grid grid-cols-4 overflow-hidden rounded border border-[var(--color-border)]">
        {envs.map(([env, detail], index) => <div key={env} className={cn("border-r border-[var(--color-border)] px-4 py-4 last:border-r-0", index < 3 && "bg-cyan-500/5")}><div className={cn("text-[13px] font-semibold", index < 3 ? "text-cyan-300" : "text-[var(--color-text-dim)]")}>{env}</div><div className="mt-1.5 text-[13px] text-[var(--color-text-muted)]">{detail}</div></div>)}
      </div>
      <div>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[16px] font-semibold text-[var(--color-text-bright)]">Sugo Console이 답하는 질문</h3>
          <span className="text-[13px] text-[var(--color-text-dim)]">작업 기록을 운영 판단에 필요한 정보로 바꿉니다.</span>
        </div>
        <div className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
          {CONSOLE_CAPABILITIES.map((feature) => (
            <div key={feature.name} className="grid gap-2 py-4 md:grid-cols-[140px_260px_minmax(0,1fr)] md:gap-5">
              <span className="text-[15px] font-semibold text-cyan-200">{feature.name}</span>
              <span className="text-[14px] font-medium text-[var(--color-text-bright)]">{feature.question}</span>
              <span className="text-[14px] leading-relaxed text-[var(--color-text-muted)]">{feature.answer}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <Fact label="상태 구분" value="개발 절차 완료, Git 전송, 실제 배포 완료를 서로 다른 상태로 표시합니다." tone="warn" />
          <Fact label="얻는 효과" value="코드 작성이 끝난 시점과 사용자가 기능을 받는 시점을 구분할 수 있습니다." tone="good" />
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
      <div className="mb-7 border-b border-[var(--color-border)] pb-6"><PageHeading eyebrow="DELIVERY PLAYBOOK" title="실행 플레이북" description="요청을 정리하고 팀의 규칙을 적용한 뒤, 실행 근거와 실제 배포 상태까지 추적합니다." action={<span className="shrink-0 text-[12px] text-[var(--color-text-dim)]">Plugin {pluginVersion ? `v${pluginVersion}` : "—"} · 기능 안내</span>} /></div>
      <div className="grid min-w-0 gap-7 xl:grid-cols-[260px_minmax(0,1fr)]">
        <nav aria-label="AI 개발 사용 시나리오" className="border-b border-[var(--color-border)] pb-5 xl:border-r xl:border-b-0 xl:pr-5 xl:pb-0"><div role="tablist" aria-orientation="vertical" className="grid grid-cols-2 gap-1 sm:grid-cols-3 xl:block xl:space-y-1">{STAGES.map((stage) => { const Icon = stage.icon; const selected = stage.id === active.id; return <button key={stage.id} role="tab" aria-selected={selected} aria-controls={`playbook-panel-${stage.id}`} id={`playbook-tab-${stage.id}`} onClick={() => setActiveId(stage.id)} className={cn("flex w-full items-center gap-2 rounded px-3 py-3 text-left transition-colors xl:gap-3 xl:px-3.5 xl:py-3.5", selected ? "bg-cyan-500/10 text-[var(--color-text-bright)]" : "text-[var(--color-text-muted)] hover:bg-[var(--color-background)] hover:text-[var(--color-text)]")}><span className={cn("font-mono text-[11px]", selected ? "text-cyan-300" : "text-[var(--color-text-dim)]")}>{stage.order}</span><Icon size={17} className={selected ? "text-cyan-300" : "text-[var(--color-text-dim)]"} /><span className="text-[14px] font-medium">{stage.label}</span></button>; })}</div></nav>
        <section role="tabpanel" id={`playbook-panel-${active.id}`} aria-labelledby={`playbook-tab-${active.id}`} className="min-w-0 px-1 py-1"><div className="mb-8 max-w-4xl"><div className="text-[12px] font-semibold tracking-[.1em] text-cyan-300">{active.eyebrow}</div><h2 className="mt-2.5 text-[29px] font-semibold tracking-[-.025em] text-[var(--color-text-bright)]">{active.title}</h2><p className="mt-3 text-[16px] leading-relaxed text-[var(--color-text-muted)]">{active.outcome}</p></div><Content /></section>
      </div>
    </div>
  );
}
