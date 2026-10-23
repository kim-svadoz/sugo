import type { MainSpot, Specialist, WorldState } from "./workWorld.js";

/**
 * 3D 작업실 배치. 바닥은 x(오른쪽)·z(앞쪽) 평면이고 북쪽(-z)과 서쪽(-x)에 벽이 있다.
 * 전문 인력은 호출되면 자기 책상에서, 아니면 라운지 소파에서 기다린다.
 */
export type Vec2 = [number, number];
export type FigurePose = "sit" | "stand" | "type" | "wave" | "celebrate" | "sip";

export const SPECIALISTS: readonly Specialist[] = ["CODE", "TEST", "REVIEW", "DOCS"];
export const DESK_X: Record<Specialist, number> = { CODE: -8, TEST: -4, REVIEW: 0, DOCS: 4 };
export const DESK_Z = 0;
const LOUNGE_SEATS: Record<Specialist, Vec2> = { CODE: [-11.4, 4.6], TEST: [-11.4, 5.6], REVIEW: [-11.4, 6.6], DOCS: [-11.4, 7.6] };

export const MAIN_SPOTS: Record<MainSpot, { position: Vec2; facing: number }> = {
  desk: { position: [-1, -5.6], facing: Math.PI },
  spec: { position: [-9, -4.4], facing: Math.PI },
  code: { position: [DESK_X.CODE + 1.5, 1.3], facing: -Math.PI / 2 },
  test: { position: [DESK_X.TEST + 1.5, 1.3], facing: -Math.PI / 2 },
  review: { position: [DESK_X.REVIEW + 1.5, 1.3], facing: -Math.PI / 2 },
  docs: { position: [DESK_X.DOCS + 1.5, 1.3], facing: -Math.PI / 2 },
  confirm: { position: [4.5, 5.7], facing: Math.PI },
  dock: { position: [8.2, 6.6], facing: Math.PI / 2 },
};

export interface Placement { at: string; position: Vec2; facing: number; pose: FigurePose }

export function placeAgents(world: WorldState): { main: Placement; specialists: Record<Specialist, Placement> } {
  const specialists = Object.fromEntries(SPECIALISTS.map((agent) => [agent, world.activeSpecialists.includes(agent)
    ? { at: "desk", position: [DESK_X[agent], DESK_Z + 1.1] as Vec2, facing: Math.PI, pose: "type" as const }
    : { at: "lounge", position: LOUNGE_SEATS[agent], facing: Math.PI / 2, pose: "sit" as const }])) as Record<Specialist, Placement>;
  const spot = MAIN_SPOTS[world.mainSpot];
  const pose: FigurePose = world.mainActivity === "waiting" ? "wave"
    : world.mainActivity === "celebrating" ? "celebrate"
    : world.mainSpot === "desk" ? (world.mainActivity === "resting" ? "sit" : "type")
    : world.mainActivity === "resting" ? "sip" : "stand";
  return { main: { at: world.mainSpot, position: spot.position, facing: spot.facing, pose }, specialists };
}
