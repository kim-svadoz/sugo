import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteFile } from "./fsUtil.js";
import { fail, ok, type GateCheckResult } from "./gates.js";

/**
 * 브랜치별 TODO-SPEC 자동 관리. `feature/<이름>` 브랜치에서 여러 세션에 걸쳐 작업이 이어질 때,
 * 새 세션이 "지금까지 뭐가 끝났고 뭐가 남았는지"를 파일 하나로 스스로 파악하게 한다.
 *
 * `sugo/features/<날짜>/<기능>/`의 PRD·work-result와는 다른 개념이다 — 그쪽은 날짜별 세션
 * 기록이고, 이건 브랜치가 존재하는 동안 계속 갱신되는 단일 문서다. 그래서 저장 위치도 분리한다:
 * `docs/feature/<이름>/TODO-SPEC.md`.
 */

export function todoSpecPath(projectPath: string, featureName: string): string {
  return join(projectPath, "docs", "feature", featureName, "TODO-SPEC.md");
}

export async function readTodoSpec(projectPath: string, featureName: string): Promise<string | null> {
  try {
    return await readFile(todoSpecPath(projectPath, featureName), "utf-8");
  } catch {
    return null;
  }
}

export interface TodoSpecDraft {
  featureName: string;
  goal: string;
  /** 이번 세션이 어디까지 다루는지를 포함해, 최종 목표에서 도출한 전체 항목. 사용자가 확정한 것만 온다. */
  items: string[];
}

/**
 * 고정 템플릿(스펙 원문)으로 최초 파일을 만든다. **사용자가 확정한 목록만** 받는다 — 모델이
 * 임의로 지어낸 목록이 파일로 고정되면 이후 모든 세션이 잘못된 전제로 동작하므로, 이 함수를
 * 부르기 전에 반드시 사용자 확인을 거쳐야 한다(그 확인 자체는 clarify 단계의 프롬프트 책임 —
 * 서버는 "확정됐다"는 호출부의 주장을 신뢰할 수밖에 없다는 한계가 있다).
 */
export async function createTodoSpec(projectPath: string, draft: TodoSpecDraft): Promise<{ path: string; content: string }> {
  const path = todoSpecPath(projectPath, draft.featureName);
  const content = [
    `# ${draft.featureName} 최종 형태 TODO-SPEC`,
    "",
    `> 브랜치: feature/${draft.featureName}`,
    "> 이 문서는 sugo가 자동으로 읽고 갱신한다. 서사가 아니라 체크리스트로만 관리한다.",
    "",
    "## 최종 목표",
    draft.goal,
    "",
    "## 완료됨",
    "",
    "## 남은 것",
    ...draft.items.map((item) => `- [ ] ${item}`),
    "",
    "## 갱신 로그",
    "",
  ].join("\n");
  await mkdir(join(projectPath, "docs", "feature", draft.featureName), { recursive: true });
  await atomicWriteFile(path, content);
  return { path, content };
}

/**
 * clarify 단계에서 최초 TODO-LIST를 확정할 때의 게이트. "모델이 임의로 확정하지 않는다"는
 * 스펙 요구를 §4.6과 같은 형태(자기보고 파라미터 강제)로 구현한다 — 진짜 확인이 일어났는지
 * 서버는 검증할 수 없고 `todoSpecUserConfirmed:true`라는 주장만 검증한다는 한계는
 * `checkUserConfirmationGate`와 동일하다.
 */
export function checkTodoSpecDraftGate(
  goal: string | undefined,
  items: string[] | undefined,
  userConfirmed: boolean | undefined,
): GateCheckResult {
  if (!goal?.trim() || !items || items.length === 0) {
    return fail(
      "TODO_SPEC_DRAFT_INCOMPLETE",
      "TODO-SPEC 초안에는 todoSpecGoal(최종 목표)과 todoSpecItems(항목 1개 이상)이 필요합니다.",
    );
  }
  if (!userConfirmed) {
    return fail(
      "TODO_SPEC_DRAFT_CONFIRMATION_REQUIRED",
      "TODO-LIST 초안을 사용자에게 보여주고 확인(todoSpecUserConfirmed:true)받은 뒤에만 파일을 생성합니다.",
    );
  }
  return ok();
}

/** 체크박스 라인만 뽑는다. 텍스트(설명·트리거 조건)는 항목 식별에서 뺀다 — 앞부분(제목)만 키로 쓴다. */
function extractCheckboxItems(content: string, checked: boolean): Set<string> {
  const re = checked ? /^- \[x\] (.+?)(?:\s+—.*)?$/gim : /^- \[ \] (.+?)(?:\s+—.*)?$/gim;
  const items = new Set<string>();
  for (const m of content.matchAll(re)) items.add(m[1].trim());
  return items;
}

export interface TodoSpecItems {
  done: Set<string>;
  remaining: Set<string>;
}

export function parseTodoSpecItems(content: string): TodoSpecItems {
  return { done: extractCheckboxItems(content, true), remaining: extractCheckboxItems(content, false) };
}

/**
 * "이번 세션이 다룬 항목이 실제로 체크됐는가"를 서버가 완전히 판정할 방법은 없다(그건 PRD↔TODO
 * 매핑처럼 자연어 대조가 필요하다 — 스펙 원문도 "강제 게이트는 아니어도 무방"이라 인정한 지점).
 * 대신 **파일이 실제로 움직였는가**를 실측한다: start 시점 스냅샷과 commit 시점 내용을 비교해
 * 최소한 하나는 참이어야 한다 — done 집합이 늘었거나(뭔가 새로 체크됐다), remaining 집합이
 * 바뀌었다(새로 발견된 잔여 항목이 추가됐다).
 */
export function todoSpecActuallySynced(snapshotAtStart: string | null, currentContent: string): boolean {
  const before = parseTodoSpecItems(snapshotAtStart ?? "");
  const after = parseTodoSpecItems(currentContent);
  const doneGrew = [...after.done].some((d) => !before.done.has(d));
  const remainingChanged =
    after.remaining.size !== before.remaining.size || [...after.remaining].some((r) => !before.remaining.has(r));
  return doneGrew || remainingChanged;
}

/**
 * commit 직전 TODO-SPEC 동기화 게이트(§4.3-T). 파일이 없으면(생성이 안 됐다) 막고, 있는데
 * `todoSpecActuallySynced`가 false면 막는다. 둘 다 `syncReason`(우회 라벨)으로만 넘어간다.
 */
export function checkTodoSpecSyncGate(
  snapshotAtStart: string | null,
  currentContent: string | null,
  syncReason: string | undefined,
): GateCheckResult {
  if (currentContent === null) {
    if (syncReason?.trim()) return ok();
    return fail(
      "TODO_SPEC_MISSING_AT_COMMIT",
      "이 브랜치는 feature/* 패턴인데 TODO-SPEC.md가 없습니다 — clarify 단계에서 최종 목표를 확정하고 생성하세요. 이번 작업과 무관하면 todoSpecSyncReason으로 사유를 남기세요.",
    );
  }
  if (todoSpecActuallySynced(snapshotAtStart, currentContent)) return ok();
  if (syncReason?.trim()) return ok();
  return fail(
    "TODO_SPEC_SYNC_REQUIRED",
    "TODO-SPEC.md가 세션 시작 이후 갱신되지 않았습니다 — 이번 세션이 다룬 항목을 체크하거나 새로 발견된 잔여 항목을 추가하세요. 이번 작업과 무관하면 todoSpecSyncReason으로 사유를 남기세요.",
  );
}
