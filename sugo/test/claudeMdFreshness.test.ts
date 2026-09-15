import { describe, expect, it } from "vitest";
import { writeClaudeIfChanged } from "../src/harness/claudeMdFreshness.js";

const BODY = "# demo — Sugo 하네스 인덱스\n\n## 적용된 하네스\n\n| id | version |\n";

describe("writeClaudeIfChanged — 스펙 §2 step 4", () => {
  it("파일이 없으면 새로 쓴다", () => {
    const r = writeClaudeIfChanged(null, BODY, "2026-09-15");
    expect(r.changed).toBe(true);
    expect(r.content).toContain(BODY);
    expect(r.content).toContain("2026-09-15");
  });

  it("내용이 같으면 타임스탬프가 달라도 재기록을 생략한다(기존 파일 그대로 유지)", () => {
    const first = writeClaudeIfChanged(null, BODY, "2026-09-10").content;
    const second = writeClaudeIfChanged(first, BODY, "2026-09-15"); // 같은 내용, 5일 뒤 재실행

    expect(second.changed).toBe(false);
    expect(second.content).toBe(first); // 오래된 타임스탬프(09-10)가 그대로 유지된다
    expect(second.content).toContain("2026-09-10");
    expect(second.content).not.toContain("2026-09-15");
  });

  it("내용이 실제로 바뀌면 재기록하고 새 타임스탬프를 찍는다", () => {
    const first = writeClaudeIfChanged(null, BODY, "2026-09-10").content;
    const changedBody = BODY + "\n| `lang/java` | 21 |\n";
    const second = writeClaudeIfChanged(first, changedBody, "2026-09-15");

    expect(second.changed).toBe(true);
    expect(second.content).toContain("2026-09-15");
    expect(second.content).toContain("lang/java");
  });

  it("기존 파일이 sugo가 만든 형식이 아니어도(수동 편집 등) 안전하게 새로 쓴다", () => {
    const r = writeClaudeIfChanged("사람이 손으로 쓴 전혀 다른 내용", BODY, "2026-09-15");
    expect(r.changed).toBe(true);
    expect(r.content).toContain(BODY);
  });
});
