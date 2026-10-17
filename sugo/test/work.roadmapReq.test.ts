import { describe, expect, it } from "vitest";
import { parseRequirementsFromPrd, promotePrdRequirements, reqConfirmId, requirementNodeId } from "../src/work/roadmapReq.js";

describe("parseRequirementsFromPrd — ### REQ-XXX: 헤딩만 인식한다", () => {
  it("스텁 범위 표시와 대시 구분자를 가진 실제 PRD 요구사항도 빠뜨리지 않는다", () => {
    expect(parseRequirementsFromPrd("### REQ-001 (스텁): 알림 대상 조회\n### REQ-002 — 채널 후보\n### REQ-004 – fallback")).toEqual([
      { id: "REQ-001", title: "(스텁) 알림 대상 조회" },
      { id: "REQ-002", title: "채널 후보" },
      { id: "REQ-004", title: "fallback" },
    ]);
  });
  it("### 헤딩 형식의 REQ를 순서대로 추출한다", () => {
    const prd = "### REQ-1: 이메일 로그인\n본문...\n### REQ-2: 소셜 로그인\n본문...";
    const result = parseRequirementsFromPrd(prd);
    expect(result).toEqual([
      { id: "REQ-1", title: "이메일 로그인" },
      { id: "REQ-2", title: "소셜 로그인" },
    ]);
  });

  it("인라인 REQ-N: (헤딩 아님)은 인식하지 않는다(analyze.ts의 느슨한 매칭과는 다른 계약)", () => {
    const prd = "REQ-1: 이메일 로그인 기능을 제공한다.";
    expect(parseRequirementsFromPrd(prd)).toEqual([]);
  });

  it("REQ가 하나도 없으면 빈 배열", () => {
    expect(parseRequirementsFromPrd("그냥 평범한 텍스트")).toEqual([]);
  });

  it("중복 id는 처음 것만 남긴다", () => {
    const prd = "### REQ-1: 첫번째\n### REQ-1: 중복";
    expect(parseRequirementsFromPrd(prd)).toEqual([{ id: "REQ-1", title: "첫번째" }]);
  });
});

describe("promotePrdRequirements — 순차 선형 의존 + REQ-CONFIRM 항상 부착", () => {
  it("REQ 노드들이 순차적으로 서로 의존한다(REQ-2는 REQ-1에 의존)", () => {
    const prd = "### REQ-1: A\n### REQ-2: B\n### REQ-3: C";
    const nodes = promotePrdRequirements("t-1", prd);
    const req1 = nodes.find((n) => n.id === "t-1::REQ-1")!;
    const req2 = nodes.find((n) => n.id === "t-1::REQ-2")!;
    const req3 = nodes.find((n) => n.id === "t-1::REQ-3")!;
    expect(req1.dependsOn).toEqual([]);
    expect(req2.dependsOn).toEqual(["t-1::REQ-1"]);
    expect(req3.dependsOn).toEqual(["t-1::REQ-2"]);
  });

  it("모든 REQ 노드는 parent가 taskId다", () => {
    const nodes = promotePrdRequirements("t-1", "### REQ-1: A");
    expect(nodes.find((n) => n.id === "t-1::REQ-1")?.parent).toBe("t-1");
  });

  it("REQ가 하나 이상이면 항상 {taskId}::REQ-CONFIRM이 부착되고 모든 REQ에 의존한다", () => {
    const nodes = promotePrdRequirements("t-1", "### REQ-1: A\n### REQ-2: B");
    const confirm = nodes.find((n) => n.id === reqConfirmId("t-1"));
    expect(confirm).toBeDefined();
    expect(confirm!.dependsOn.sort()).toEqual(["t-1::REQ-1", "t-1::REQ-2"]);
    expect(confirm!.parent).toBe("t-1");
  });

  it("REQ가 하나도 없으면 REQ-CONFIRM도 만들지 않는다(빈 승격)", () => {
    expect(promotePrdRequirements("t-1", "평범한 텍스트")).toEqual([]);
  });

  it("REQ 노드/REQ-CONFIRM 모두 초기 상태는 pending이다", () => {
    const nodes = promotePrdRequirements("t-1", "### REQ-1: A");
    expect(nodes.every((n) => n.status === "pending")).toBe(true);
  });
});

describe("reqConfirmId", () => {
  it("taskId::REQ-CONFIRM 형태를 만든다", () => {
    expect(reqConfirmId("t-1")).toBe("t-1::REQ-CONFIRM");
  });
});

describe("requirementNodeId", () => {
  it("workspace 전역 충돌을 막기 위해 task id로 REQ를 namespace한다", () => {
    expect(requirementNodeId("task-a", "REQ-1")).toBe("task-a::REQ-1");
    expect(requirementNodeId("task-b", "REQ-1")).not.toBe(requirementNodeId("task-a", "REQ-1"));
  });
});
