import { describe, expect, it } from "vitest";
import { clampTourTargetRect, positionTourCard, rectInZoomedSpace, viewportInZoomedSpace } from "./onboardingTourGeometry.js";

describe("시작 투어 화면 배치", () => {
  it("화면보다 넓은 대상을 강조해도 테두리가 뷰포트를 벗어나지 않는다", () => {
    const rect = clampTourTargetRect(
      { top: 320, left: 220, right: 2_180, bottom: 470 },
      { width: 2_048, height: 1_035 },
    );

    expect(rect.right).toBe(2_044);
    expect(rect.width).toBe(rect.right - rect.left);
    expect(rect.left + rect.width).toBeLessThanOrEqual(2_048);
  });

  it("사이드바 대상을 안내할 때 카드는 대상 오른쪽의 화면 안에 놓인다", () => {
    const position = positionTourCard(
      { top: 400, left: 8, right: 228, bottom: 510, width: 220, height: 110 },
      { width: 2_048, height: 1_035 },
    );

    expect(position.left).toBeGreaterThan(228);
    expect(position.left + position.width).toBeLessThanOrEqual(2_032);
    expect(position.top + position.maxHeight).toBe(1_019);
  });

  it("브라우저 글자 확대에서도 내용이 잘리지 않도록 카드 높이를 강제하지 않는다", () => {
    const position = positionTourCard(
      { top: 340, left: 460, right: 990, bottom: 460, width: 530, height: 120 },
      { width: 2_395, height: 1_082 },
    );

    expect(position).not.toHaveProperty("height");
    expect(position.maxHeight).toBe(726);
  });
});

describe("body zoom 보정", () => {
  it("확대된 화면 기준 좌표를 body 안에서 그릴 좌표로 되돌린다", () => {
    expect(rectInZoomedSpace({ top: 900, left: 40, right: 440, bottom: 980 }, 2)).toEqual({ top: 450, left: 20, right: 220, bottom: 490 });
    const playbook = rectInZoomedSpace({ top: 495, left: 22, right: 242, bottom: 539 }, 1.1);
    expect(playbook.top).toBeCloseTo(450);
    expect(playbook.left).toBeCloseTo(20);
  });

  it("zoom이 없거나 잘못 읽히면 그대로 둔다", () => {
    expect(rectInZoomedSpace({ top: 10, left: 20, right: 30, bottom: 40 }, 1)).toEqual({ top: 10, left: 20, right: 30, bottom: 40 });
    expect(viewportInZoomedSpace({ width: 100, height: 50 }, 0)).toEqual({ width: 100, height: 50 });
  });
});
