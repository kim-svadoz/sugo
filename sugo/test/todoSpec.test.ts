import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkTodoSpecDraftGate,
  checkTodoSpecSyncGate,
  createTodoSpec,
  parseTodoSpecItems,
  readTodoSpec,
  todoSpecActuallySynced,
  todoSpecPath,
} from "../src/todoSpec.js";

describe("todoSpecPath — 저장 위치 규약(고정)", () => {
  it("sugo/docs/feature/<이름>/TODO-SPEC.md", () => {
    expect(todoSpecPath("/repo", "abc")).toBe(join("/repo", "sugo", "docs", "feature", "abc", "TODO-SPEC.md"));
  });
});

describe("parseTodoSpecItems — 체크박스만 뽑는다", () => {
  const content = [
    "# f 최종 형태 TODO-SPEC",
    "## 완료됨",
    "- [x] a 출력 — 2026-09-18",
    "## 남은 것",
    "- [ ] b 출력 — 트리거: 사용자 요청",
    "- [ ] c 출력",
  ].join("\n");

  it("완료된 항목을 done에 담는다(설명 텍스트는 뺀다)", () => {
    expect(parseTodoSpecItems(content).done).toEqual(new Set(["a 출력"]));
  });

  it("남은 항목을 remaining에 담는다", () => {
    expect(parseTodoSpecItems(content).remaining).toEqual(new Set(["b 출력", "c 출력"]));
  });

  it("빈 문자열은 빈 집합", () => {
    const r = parseTodoSpecItems("");
    expect(r.done.size).toBe(0);
    expect(r.remaining.size).toBe(0);
  });
});

describe("todoSpecActuallySynced — 파일이 실제로 움직였는가", () => {
  const before = ["## 완료됨", "## 남은 것", "- [ ] a", "- [ ] b"].join("\n");

  it("항목이 체크되면 true", () => {
    const after = ["## 완료됨", "- [x] a", "## 남은 것", "- [ ] b"].join("\n");
    expect(todoSpecActuallySynced(before, after)).toBe(true);
  });

  it("남은 것에 새 항목이 추가되면 true", () => {
    const after = ["## 완료됨", "## 남은 것", "- [ ] a", "- [ ] b", "- [ ] c(신규 발견)"].join("\n");
    expect(todoSpecActuallySynced(before, after)).toBe(true);
  });

  it("아무것도 안 바뀌면 false", () => {
    expect(todoSpecActuallySynced(before, before)).toBe(false);
  });

  it("snapshotAtStart가 null인데 내용이 있으면 true다 — 파일이 없다가 생긴 것 자체가 신호", () => {
    // 정상 흐름(sugoPlan.ts)에서는 clarify가 파일 생성 직후 세션의 snapshotAtStart를 그 내용으로
    // 갱신하므로 이 조합은 안 생긴다. 하지만 사람이 sugo를 거치지 않고 파일을 직접 만들어둔
    // 경우(snapshotAtStart는 null로 기록된 채)엔 이게 맞는 판정이다 — "남은 것"이 0에서 N으로
    // 늘어난 것 자체가 "이번 세션이 TODO-SPEC을 다뤘다"는 증거다.
    expect(todoSpecActuallySynced(null, before)).toBe(true);
  });
});

describe("checkTodoSpecDraftGate — 최초 확정 게이트", () => {
  it("goal·items·confirmed가 다 있으면 통과", () => {
    expect(checkTodoSpecDraftGate("최종 목표", ["a", "b"], true).ok).toBe(true);
  });

  it("goal이 없으면 거부", () => {
    expect(checkTodoSpecDraftGate(undefined, ["a"], true).code).toBe("TODO_SPEC_DRAFT_INCOMPLETE");
  });

  it("items가 비었으면 거부", () => {
    expect(checkTodoSpecDraftGate("목표", [], true).code).toBe("TODO_SPEC_DRAFT_INCOMPLETE");
  });

  it("confirmed가 없으면 거부 — 모델이 임의로 확정하지 않는다", () => {
    const r = checkTodoSpecDraftGate("목표", ["a"], false);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("TODO_SPEC_DRAFT_CONFIRMATION_REQUIRED");
  });
});

describe("checkTodoSpecSyncGate — commit 직전 동기화 확인", () => {
  const before = ["## 완료됨", "## 남은 것", "- [ ] a"].join("\n");

  it("파일이 없으면 거부(생성이 안 됐다)", () => {
    expect(checkTodoSpecSyncGate(before, null, undefined).code).toBe("TODO_SPEC_MISSING_AT_COMMIT");
  });

  it("파일이 없어도 사유가 있으면 통과", () => {
    expect(checkTodoSpecSyncGate(before, null, "핫픽스라 무관").ok).toBe(true);
  });

  it("갱신 안 됐으면 거부", () => {
    expect(checkTodoSpecSyncGate(before, before, undefined).code).toBe("TODO_SPEC_SYNC_REQUIRED");
  });

  it("갱신됐으면 통과", () => {
    const after = ["## 완료됨", "- [x] a", "## 남은 것"].join("\n");
    expect(checkTodoSpecSyncGate(before, after, undefined).ok).toBe(true);
  });

  it("안 갱신됐어도 사유가 있으면 통과", () => {
    expect(checkTodoSpecSyncGate(before, before, "이번 작업과 무관").ok).toBe(true);
  });
});

describe("createTodoSpec / readTodoSpec — 실제 파일 IO", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "sugo-todospec-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("고정 템플릿으로 생성하고 그대로 읽힌다", async () => {
    const { path, content } = await createTodoSpec(dir, { featureName: "abc", goal: "abc를 출력", items: ["a 출력", "b 출력"] });
    expect(path).toBe(todoSpecPath(dir, "abc"));
    expect(content).toContain("> 브랜치: feature/abc");
    expect(content).toContain("## 최종 목표\nabc를 출력");
    expect(content).toContain("- [ ] a 출력");
    expect(content).toContain("- [ ] b 출력");
    expect(await readTodoSpec(dir, "abc")).toBe(content);
  });

  it("없는 파일은 null", async () => {
    expect(await readTodoSpec(dir, "없음")).toBeNull();
  });
});
