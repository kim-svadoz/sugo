import { useEffect, useMemo, useState } from "react";
import { Boxes, GitBranch, LayoutDashboard, ShieldCheck, Wand2, Workflow, type LucideIcon } from "lucide-react";
import { cn } from "../lib/utils.js";
import { useDashboardMeta } from "../hooks/useDashboardMeta.js";

const HERO_TEXT = "AI 에이전트 작업 맥락 관제 및 가이드북";

type TabId = 1 | 2 | 3 | 4 | 5 | 6;
const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 1, label: "도메인 묶기", icon: Boxes },
  { id: 2, label: "하네스 주입", icon: Wand2 },
  { id: 3, label: "에이전트 체인", icon: Workflow },
  { id: 4, label: "완료 검증", icon: ShieldCheck },
  { id: 5, label: "패치 계보 & 기억", icon: GitBranch },
  { id: 6, label: "로드맵 캔버스", icon: LayoutDashboard },
];

/** 설계안 IntroBox 문구 — 그대로. */
const INTRO: Record<TabId, string[]> = {
  1: [
    "AI는 레포 경계에서 맥락을 잃는다.",
    "character-service와 inventory-service를 따로 작업하면 서로의 계약이 어긋난다.",
    "한 워크스페이스로 묶으면 이력·체크포인트·로드맵을 함께 본다.",
  ],
  2: [
    "팀 표준을 매번 설명할 필요가 없다.",
    "sugo:add가 스택을 감지해 팀 규칙(ArchUnit·생성자 주입·패키지 비순환)을 CLAUDE.md로 합성하고 .claude/rules에 심는다.",
    "이후 에이전트는 이 규칙 안에서만 움직인다.",
  ],
  3: [
    "Sugo는 기능 하나를 명세부터 커밋까지 정해진 순서로 끌고 간다.",
    "구현 단계에선 code-agent가 요구사항(REQ)을 하나씩 끝내며 진행바를 올리고, 전부 끝나야 다음 단계로 넘어간다.",
    "내부적으로는 13개 상태를 게이트로 관리하며, 단계를 건너뛸 수 없다.",
  ],
  4: [
    "완료는 선언이 아니라 증명이다.",
    "Sugo는 '리뷰 통과'라는 말을 그대로 믿지 않는다.",
    "커버리지·회귀·런타임·계약 게이트와 PRD 정합성 검사가 거짓 완료를 걸러낸다.",
  ],
  5: [
    "완료됐다고 끝이 아니다.",
    "/sugo:patch로 이어가면 원본 아래 패치 v1·v2·v3가 계보로 쌓이고, 각 패치마다 AI 작업요약이 남는다.",
    "여기에 AI가 코드만 봐선 알 수 없는 회사 안쪽 맥락(도메인 규칙·사고 이력·법무 제약)을 체크포인트로 심어두면, 세션이 바뀌어도 그 판단이 유지된다.",
  ],
  6: [
    "AI가 만든 결과를 눈으로 검증하고 관제하는 시각 컨트롤타워.",
    "로드맵에서 노드를 클릭하면 요구사항 진행·AI 작업요약·변경 파일을 그 자리에서 확인한다.",
    "검토가 끝나면 review-agent가 Bitbucket PR까지 이어간다 — 대시보드가 모은 요약으로 pre-fill된다.",
  ],
};

const HARNESS_STEPS = [
  "🔍 스택 감지…",
  "📦 Java 21 / Spring Boot 3.x / Gradle / PostgreSQL 감지",
  "🧬 ArchUnit 규칙 주입 (패키지 비순환)",
  "🧬 생성자 주입 강제",
  "✅ 하네스 이식 완료",
];

const CODE_ASIS = `@Service
public class CharacterService {
    @Autowired
    private CharacterRepository repository;
}`;
const CODE_TOBE = `@Service
@RequiredArgsConstructor
public class CharacterService {
    private final CharacterRepository repository;
}`;

const STEPS = [
  { n: 1, key: "scan", title: "프로젝트 파악", sub: "스캔·세션 생성" },
  { n: 2, key: "clarify", title: "요구사항 확정", sub: "질문으로 명확화" },
  { n: 3, key: "prd", title: "명세 작성", sub: "PRD 문서화" },
  { n: 4, key: "jira", title: "이슈 연동", sub: "Jira · 선택" },
  { n: 5, key: "implement", title: "구현", sub: "code-agent · REQ 하나씩" },
  { n: 6, key: "verify", title: "테스트·검증", sub: "test-agent · 회귀+신규" },
  { n: 7, key: "review", title: "리뷰·감사", sub: "review-agent · 아키텍처" },
  { n: 8, key: "readme", title: "문서 갱신", sub: "README·docs 재작성" },
  { n: 9, key: "commit", title: "커밋", sub: "fix/feat 자동" },
];
const REQS = ["REQ-001", "REQ-002", "REQ-003", "REQ-004", "REQ-005", "REQ-006", "REQ-007"];
const IMPLEMENT_INDEX = 4;

const AUDIT_ROWS = [
  { key: "coverage", label: "커버리지", detail: "jacoco · 라인 80% 기준" },
  { key: "regression", label: "회귀", detail: "CharacterServiceTest 전량" },
  { key: "contract", label: "계약", detail: "character↔inventory 스펙 대조" },
  { key: "archunit", label: "ArchUnit 규칙", detail: "ConstructorInjectionRule" },
];

const DEMO_PATCHES: Record<string, string> = {
  v1: "404 예외처리 보강",
  v2: "ETag / 304 캐싱",
  v3: "조회 레이트리밋",
};

const SEED_RULES = [
  "캐릭터 삭제 후 닉네임 30일 예약 — 재사용 금지(명의 도용 방지)",
  "확률형 아이템 확률은 공시값이 원본 — 코드 상수 신뢰 금지(게임산업법 확률 공시)",
  "만 18세 미만 계정은 심야(00~06시) 접속·결제 제한 — 청소년보호법",
];

const ROADMAP_NODES = [
  { id: "t-026", label: "캐릭터 단건조회 API 추가", kind: "원본", status: "done" },
  { id: "t-026-p1", label: "404 예외처리 보강", kind: "v1-patch", status: "done" },
  { id: "t-026-p2", label: "ETag / 304 캐싱", kind: "v2-patch", status: "in_progress" },
];

/**
 * EndingCTA 4단계. **정리 주의(설계안):** 원본은 마켓플레이스명을 쓰는데 이 로컬엔
 * 그 이름이 없다 — 자리표시자를 그대로 노출해 "본인 값을 넣으라"고 알린다. 그럴싸한 가짜 호스트를
 * 지어 넣으면 사용자가 그대로 복사해 실행하고 실패한다.
 */
const ENDING_CTA = [
  "/plugin update sugo@<marketplace>",
  "/sugo:ws-add {workspace}",
  "/sugo:add {등록할프로젝트경로} {workspace}",
  "/sugo:feat {프로젝트}에서 캐릭터 단건조회 API 추가",
];

function IntroBox({ lines }: { lines: string[] }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)]/60 p-5">
      <div className="flex gap-3">
        <span className="shrink-0 text-[20px]">💡</span>
        <div className="space-y-1.5">
          {lines.map((l) => (
            <p key={l} className="text-[15px] leading-relaxed text-[var(--color-text)]">
              {l}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

function CodeBlock({ title, code, tone }: { title: string; code: string; tone: "asis" | "tobe" }) {
  return (
    <div className="min-w-0 flex-1">
      <div
        className={cn(
          "mb-1.5 inline-block rounded border px-2 py-0.5 font-mono text-[11px]",
          tone === "asis" ? "border-rose-500/40 text-rose-300" : "border-emerald-500/40 text-emerald-300",
        )}
      >
        {title}
      </div>
      <pre className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3 font-mono text-[11.5px] leading-relaxed text-[var(--color-text)]">
        {code}
      </pre>
    </div>
  );
}

/**
 * 설계안 Playbook — **100% 시뮬레이션이다.** 네트워크 호출이 하나도 없고 화면의 숫자·로그·
 * 노드는 전부 이 파일 안의 상수다. 실제 데이터를 섞으면 "체험"과 "관제"가 뒤엉켜 사용자가 지금
 * 보는 게 자기 프로젝트인지 예시인지 구분을 못 한다.
 */
export function Playbook() {
  const [tab, setTab] = useState<TabId>(1);
  const [typed, setTyped] = useState(0);
  const [harnessStep, setHarnessStep] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [reqDone, setReqDone] = useState(0);
  const [auditPass, setAuditPass] = useState<Record<string, boolean>>({});
  const [blocked, setBlocked] = useState(true);
  const { pluginVersion } = useDashboardMeta();

  const reduced = useMemo(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  // 히어로 타이핑 — 1회 완주. reduced-motion이면 즉시 전체.
  useEffect(() => {
    if (reduced) {
      setTyped(HERO_TEXT.length);
      return;
    }
    const id = window.setInterval(() => {
      setTyped((t) => {
        if (t >= HERO_TEXT.length) {
          window.clearInterval(id);
          return t;
        }
        return t + 1;
      });
    }, 55);
    return () => window.clearInterval(id);
  }, [reduced]);

  useEffect(() => {
    if (tab !== 2) return;
    setHarnessStep(0);
    const id = window.setInterval(() => setHarnessStep((s) => (s >= HARNESS_STEPS.length ? s : s + 1)), 700);
    return () => window.clearInterval(id);
  }, [tab]);

  // 탭3 — 구현 단계에서는 REQ를 하나씩 끝낸 **뒤에야** 다음 단계로 넘어간다(스펙의 핵심 연출).
  useEffect(() => {
    if (tab !== 3) return;
    setStepIndex(0);
    setReqDone(0);
    const id = window.setInterval(() => {
      setStepIndex((si) => {
        if (si === IMPLEMENT_INDEX) {
          setReqDone((r) => (r < REQS.length ? r + 1 : r));
          return si;
        }
        return si >= STEPS.length - 1 ? si : si + 1;
      });
    }, 600);
    return () => window.clearInterval(id);
  }, [tab]);

  useEffect(() => {
    if (tab === 3 && stepIndex === IMPLEMENT_INDEX && reqDone >= REQS.length) {
      const t = window.setTimeout(() => setStepIndex((s) => s + 1), 600);
      return () => window.clearTimeout(t);
    }
  }, [tab, stepIndex, reqDone]);

  // 탭4 — 순서대로 통과시키되 ArchUnit에서 막는다("완료는 선언이 아니라 증명").
  useEffect(() => {
    if (tab !== 4) return;
    setAuditPass({});
    setBlocked(true);
    let i = 0;
    const id = window.setInterval(() => {
      const row = AUDIT_ROWS[i];
      if (!row) {
        window.clearInterval(id);
        return;
      }
      setAuditPass((p) => ({ ...p, [row.key]: row.key !== "archunit" }));
      i++;
    }, 700);
    return () => window.clearInterval(id);
  }, [tab]);

  return (
    <div className="pb-compact relative">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="pb-aurora-a absolute -left-20 -top-24 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="pb-aurora-b absolute -right-16 top-32 h-80 w-80 rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <div className="group relative mx-auto max-w-7xl overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/80 p-8 shadow-2xl backdrop-blur-sm">
        <div className="mb-1 flex flex-wrap items-center gap-3">
          <h1 className="text-4xl font-bold tracking-tight text-[var(--color-text-bright)]">Sugo 플레이북</h1>
          <span className="rounded-md border border-[var(--color-border)] px-2 py-0.5 font-mono text-[11.5px] text-[var(--color-text-muted)]">
            v{pluginVersion ?? "—"}
          </span>
        </div>
        <p className="mb-6 font-mono text-[14px] text-[var(--color-text-muted)]">
          {HERO_TEXT.slice(0, typed)}
          {typed < HERO_TEXT.length && <span className="pb-caret">▍</span>}
        </p>

        <div className="mb-6 flex flex-wrap gap-2">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] transition-colors",
                tab === id
                  ? "bg-[var(--color-primary)] text-white"
                  : "border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
              )}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        <div className="space-y-5">
          <IntroBox lines={INTRO[tab]} />

          {tab === 1 && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {["character-service", "inventory-service", "auth-service"].map((repo, i) => (
                <div
                  key={repo}
                  className={cn(
                    "rounded-xl border p-4 font-mono text-[12.5px]",
                    i < 2
                      ? "border-cyan-500/40 bg-cyan-500/5 text-cyan-200"
                      : "border-[var(--color-border)] text-[var(--color-text-muted)]",
                  )}
                >
                  📦 {repo}
                  <div className="mt-1 text-[11px] text-[var(--color-text-dim)]">
                    {i < 2 ? "workspace: game-core" : "미소속"}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 2 && (
            <div className="space-y-4">
              <div className="space-y-1 font-mono text-[12.5px]">
                {HARNESS_STEPS.slice(0, harnessStep).map((s) => (
                  <div key={s} className="pb-log-in text-[var(--color-text)]">
                    {s}
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-3 md:flex-row">
                <CodeBlock title="AS-IS" code={CODE_ASIS} tone="asis" />
                <CodeBlock title="TO-BE" code={CODE_TOBE} tone="tobe" />
              </div>
              <p className="font-mono text-[11.5px] text-[var(--color-text-dim)]">CharacterService.java</p>
            </div>
          )}

          {tab === 3 && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-1.5">
                {STEPS.map((s, i) => (
                  <div
                    key={s.key}
                    className={cn(
                      "rounded-lg border px-2.5 py-1.5 text-[11.5px]",
                      i < stepIndex
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        : i === stepIndex
                          ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-200"
                          : "border-[var(--color-border)] text-[var(--color-text-dim)]",
                    )}
                  >
                    <span className="font-mono">{s.n}.</span> {s.title}
                    <div className="text-[10px] opacity-70">{s.sub}</div>
                  </div>
                ))}
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between font-mono text-[11.5px] text-[var(--color-text-muted)]">
                  <span>구현 — REQ 하나씩</span>
                  <span>
                    {reqDone}/{REQS.length}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
                  <div
                    className="h-full rounded-full bg-cyan-400 transition-all duration-500"
                    style={{ width: `${(reqDone / REQS.length) * 100}%` }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {REQS.map((r, i) => (
                    <span
                      key={r}
                      className={cn(
                        "rounded border px-1.5 py-0.5 font-mono text-[10px]",
                        i < reqDone
                          ? "border-emerald-500/40 text-emerald-300"
                          : "border-[var(--color-border)] text-[var(--color-text-dim)]",
                      )}
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 4 && (
            <div className="space-y-3">
              {AUDIT_ROWS.map((row) => {
                const state = auditPass[row.key];
                return (
                  <div
                    key={row.key}
                    className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
                  >
                    <span
                      className={cn(
                        "w-14 shrink-0 rounded border px-1.5 py-0.5 text-center font-mono text-[10px]",
                        state === undefined
                          ? "border-[var(--color-border)] text-[var(--color-text-dim)]"
                          : state
                            ? "border-emerald-500/40 text-emerald-300"
                            : "border-rose-500/40 text-rose-300",
                      )}
                    >
                      {state === undefined ? "…" : state ? "PASS" : "FAIL"}
                    </span>
                    <span className="text-[13px] text-[var(--color-text)]">{row.label}</span>
                    <span className="ml-auto font-mono text-[11px] text-[var(--color-text-dim)]">{row.detail}</span>
                  </div>
                );
              })}
              {blocked && auditPass.archunit === false && (
                <div className="pb-slam rounded-lg border border-rose-500/40 bg-rose-500/10 p-4">
                  <div className="font-mono text-[13px] font-bold text-rose-300">🚫 needs_fix — ArchUnit 규칙 위배</div>
                  <p className="mt-1 text-[12.5px] text-rose-200/90">
                    ConstructorInjectionRule: 생성자 final 누락이 검출됐습니다. '완료'는 선언이 아니라 증명입니다.
                  </p>
                  <button
                    onClick={() => setBlocked(false)}
                    className="mt-2 rounded border border-rose-500/40 px-2 py-1 font-mono text-[11px] text-rose-200 hover:bg-rose-500/10"
                  >
                    확인
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 5 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="font-mono text-[11.5px] text-[var(--color-text-muted)]">패치 계보</div>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-mono text-[12px] text-[var(--color-text)]">
                  원본 · 캐릭터 단건조회 API
                </div>
                {Object.entries(DEMO_PATCHES).map(([v, label], i) => (
                  <div
                    key={v}
                    className="rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-2 font-mono text-[12px] text-violet-200"
                    style={{ marginLeft: (i + 1) * 16 }}
                  >
                    {v} · {label}
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <div className="font-mono text-[11.5px] text-[var(--color-text-muted)]">체크포인트로 심는 회사 맥락</div>
                {SEED_RULES.map((r) => (
                  <div
                    key={r}
                    className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12.5px] leading-relaxed text-amber-100"
                  >
                    {r}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 6 && (
            <div className="space-y-2">
              <div className="rounded-lg border border-[var(--color-border)] bg-slate-500/10 px-3 py-2 font-mono text-[12.5px] text-[var(--color-text)]">
                📄 SPEC · 캐릭터 단건조회 API 추가
              </div>
              <div
                className="rounded-lg border border-[var(--color-border)] bg-slate-500/10 px-3 py-2 font-mono text-[12.5px] text-[var(--color-text)]"
                style={{ marginLeft: 18 }}
              >
                🔁 RUN · character-service
              </div>
              {ROADMAP_NODES.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 font-mono text-[12px]",
                    n.status === "done" ? "border-emerald-600/40 text-emerald-200" : "border-[#5c8bcc]/50 text-[#9dbdea]",
                  )}
                  style={{ marginLeft: 36 }}
                >
                  <span className="rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-dim)]">
                    {n.kind}
                  </span>
                  {n.label}
                </div>
              ))}
              <p className="pt-1 font-mono text-[11.5px] text-[var(--color-text-dim)]">SPEC ⊃ RUN ⊃ TASK ⊃ 요구사항</p>
              <p className="font-mono text-[11.5px] text-[var(--color-text-dim)]">노드 클릭 → 우측에서 상세·PR</p>
            </div>
          )}

          <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-5">
            <div className="mb-2 text-[13px] font-semibold text-[var(--color-text-bright)]">시작하기</div>
            <ol className="space-y-1.5">
              {ENDING_CTA.map((cmd, i) => (
                <li key={cmd} className="flex items-center gap-2 font-mono text-[12px]">
                  <span className="w-4 shrink-0 text-[var(--color-text-dim)]">{i + 1}</span>
                  <code className="rounded bg-[var(--color-background)] px-2 py-1 text-cyan-200">{cmd}</code>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-[11px] text-[var(--color-text-dim)]">
              꺾쇠·중괄호는 자리표시자입니다 — 본인 마켓플레이스·워크스페이스 값으로 바꿔서 실행하세요.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
