import { describe, expect, it } from "vitest";
import { placeAgents } from "./workRoom.js";
import type { WorldState } from "./workWorld.js";

const idle: WorldState = { mainSpot: "desk", mainActivity: "resting", activeSpecialist: null, activeSpecialists: [], live: false };

describe("placeAgents", () => {
  it("일이 없으면 전문 인력은 모두 라운지에서 쉬고 메인은 자기 책상에 앉는다", () => {
    const placed = placeAgents(idle);
    expect(Object.values(placed.specialists).map((spot) => spot.at)).toEqual(["lounge", "lounge", "lounge", "lounge"]);
    expect(placed.main).toMatchObject({ at: "desk", pose: "sit" });
  });

  it("라운지 자리는 인력마다 달라 겹치지 않는다", () => {
    const seats = Object.values(placeAgents(idle).specialists).map((spot) => spot.position.join(","));
    expect(new Set(seats).size).toBe(4);
  });

  it("호출된 인력만 자기 책상에서 일하고, 메인은 그 책상 옆에서 지시한다", () => {
    const placed = placeAgents({ ...idle, mainSpot: "test", mainActivity: "working", activeSpecialist: "TEST", activeSpecialists: ["TEST", "DOCS"], live: true });
    expect(placed.specialists.TEST).toMatchObject({ at: "desk", pose: "type" });
    expect(placed.specialists.DOCS).toMatchObject({ at: "desk", pose: "type" });
    expect(placed.specialists.CODE.at).toBe("lounge");
    expect(placed.main).toMatchObject({ at: "test", pose: "stand" });
  });

  it("사용자 확인을 기다리면 메인은 카운터에서 손을 들고, 완료하면 출고대에서 축하한다", () => {
    expect(placeAgents({ ...idle, mainSpot: "confirm", mainActivity: "waiting" }).main).toMatchObject({ at: "confirm", pose: "wave" });
    expect(placeAgents({ ...idle, mainSpot: "dock", mainActivity: "celebrating", live: true }).main).toMatchObject({ at: "dock", pose: "celebrate" });
  });
});
