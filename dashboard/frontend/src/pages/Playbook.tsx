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
  { id: "intent", order: "01", label: "기획을 기능 명세로", eyebrow: "기획 정리", title: "흩어진 기획을 개발 기준으로 바꿉니다", outcome: "개발 전에 목표, 범위, 기능 요구사항, 확인 기준을 한 문서에 기록합니다.", icon: FileCode2 },
  { id: "context", order: "02", label: "팀의 판단을 규칙으로", eyebrow: "팀 지식 유지", title: "코드에 없는 판단도 다음 작업에 적용합니다", outcome: "AI는 기술 표준과 도메인 규칙을 같은 기준으로 읽습니다.", icon: Blocks },
  { id: "delivery", order: "03", label: "작업 단계 통제", eyebrow: "개발 순서 관리", title: "큰 요청을 확인 가능한 단위로 나눕니다", outcome: "AI는 필요한 근거를 기록해야 다음 단계로 이동할 수 있습니다.", icon: ShieldCheck },
  { id: "review", order: "04", label: "근거를 보고 판단", eyebrow: "사용자 검토", title: "승인을 요청하기 전에 검토 자료를 제공합니다", outcome: "사용자는 변경 내용과 검증 결과를 확인한 뒤 다음 행동을 결정합니다.", icon: ClipboardCheck },
  { id: "lineage", order: "05", label: "후속 변경 잇기", eyebrow: "개발 이력 유지", title: "완료된 결과를 보존하고 다음 변경을 잇습니다", outcome: "Sugo는 각 후속 변경의 이유, 결과, 검증 기록을 별도로 보존합니다.", icon: GitBranch },
  { id: "operations", order: "06", label: "배포까지 확인", eyebrow: "제품 반영 확인", title: "개발 완료와 실제 배포를 구분합니다", outcome: "Sugo는 작업, 코드, 배포 상태를 같은 기능 명세를 기준으로 연결합니다.", icon: Radar },
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
    ["구현 담당", "기능 요구사항 단위로 코드를 변경합니다."],
    ["테스트 담당", "새 테스트와 회귀 테스트를 실행하고 증거를 기록합니다."],
    ["검토 담당", "개발 명세, 실행 결과, 계약, 위험을 확인합니다."],
    ["문서 담당", "변경된 동작과 설명 문서를 일치시킵니다."],
  ];
  return (
    <div className="space-y-7">
      <Flow steps={["개발 명세", "변경 전 상태", "계약 테스트", "구현", "테스트", "검토", "문서"]} />
      <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          {agents.map(([name, role]) => <div key={name} className="border-t border-[var(--color-border)] py-4"><div className="text-[13px] font-semibold text-cyan-300">{name}</div><div className="mt-1.5 text-[14px] leading-relaxed text-[var(--color-text-muted)]">{role}</div></div>)}
        </div>
        <div>
          <Fact label="작업 순서" value="현재 상태에서 실행할 수 있는 다음 행동만 제시합니다." />
          <Fact label="실행 증거" value="테스트 이름, 실행 명령, 결과, 변경 파일 정보를 저장된 기록과 비교합니다." />
          <Fact label="작업 차단" value="근거가 없거나 결과가 다르면 다음 단계로 이동하지 않습니다. 부족한 조건도 표시합니다." tone="warn" />
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
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <Fact label="일정" value="시작 전, 진행 중, 검토 필요, 마감일이 지난 미종료 기능 명세를 확인합니다." />
          <Fact label="AI 작업 현황" value="기능 명세, 실행 차수, 작업, 기능 요구사항, 후속 변경을 한 구조에서 확인합니다." />
          <Fact label="개발 이력" value="AI가 완료한 기능과 주요 설계 결정을 장기 기록으로 남깁니다." />
        </div>
        <div>
          <Fact label="배포 판정" value="작업 커밋과 각 환경에서 실행 중인 이미지를 비교합니다." />
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
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-border)] pb-6">
        <div><div className="mb-2 flex items-center gap-2 text-[12px] font-semibold tracking-[.12em] text-cyan-300"><span className="h-px w-7 bg-cyan-400" />AI 개발 플레이북</div><h1 className="text-[34px] font-semibold tracking-[-.03em] text-[var(--color-text-bright)]">AI에 개발을 맡겨도 판단 기준을 유지합니다</h1><p className="mt-3 text-[16px] leading-relaxed text-[var(--color-text-muted)]">요청을 명확히 정리합니다. 팀의 규칙을 적용합니다. 실행 근거를 확인합니다. 실제 배포 상태까지 추적합니다.</p></div>
        <span className="shrink-0 text-[12px] text-[var(--color-text-dim)]">Plugin {pluginVersion ? `v${pluginVersion}` : "—"} · 기능 안내</span>
      </header>
      <div className="grid min-w-0 gap-7 xl:grid-cols-[260px_minmax(0,1fr)]">
        <nav aria-label="AI 개발 사용 시나리오" className="border-b border-[var(--color-border)] pb-5 xl:border-r xl:border-b-0 xl:pr-5 xl:pb-0"><div role="tablist" aria-orientation="vertical" className="grid grid-cols-2 gap-1 sm:grid-cols-3 xl:block xl:space-y-1">{STAGES.map((stage) => { const Icon = stage.icon; const selected = stage.id === active.id; return <button key={stage.id} role="tab" aria-selected={selected} aria-controls={`playbook-panel-${stage.id}`} id={`playbook-tab-${stage.id}`} onClick={() => setActiveId(stage.id)} className={cn("flex w-full items-center gap-2 rounded px-3 py-3 text-left transition-colors xl:gap-3 xl:px-3.5 xl:py-3.5", selected ? "bg-cyan-500/10 text-[var(--color-text-bright)]" : "text-[var(--color-text-muted)] hover:bg-[var(--color-background)] hover:text-[var(--color-text)]")}><span className={cn("font-mono text-[11px]", selected ? "text-cyan-300" : "text-[var(--color-text-dim)]")}>{stage.order}</span><Icon size={17} className={selected ? "text-cyan-300" : "text-[var(--color-text-dim)]"} /><span className="text-[14px] font-medium">{stage.label}</span></button>; })}</div></nav>
        <section role="tabpanel" id={`playbook-panel-${active.id}`} aria-labelledby={`playbook-tab-${active.id}`} className="min-w-0 px-1 py-1"><div className="mb-8 max-w-4xl"><div className="text-[12px] font-semibold tracking-[.1em] text-cyan-300">{active.eyebrow}</div><h2 className="mt-2.5 text-[29px] font-semibold tracking-[-.025em] text-[var(--color-text-bright)]">{active.title}</h2><p className="mt-3 text-[16px] leading-relaxed text-[var(--color-text-muted)]">{active.outcome}</p></div><Content /></section>
      </div>
    </div>
  );
}
