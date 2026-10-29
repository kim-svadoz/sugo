export interface TourViewport {
  width: number;
  height: number;
}

export interface TourRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface RawRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

interface TourCardPosition {
  top: number;
  left: number;
  width: number;
  height: number;
}

const EDGE = 16;
const TARGET_GAP = 4;
const CARD_GAP = 14;
const CARD_HEIGHT = 220;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function clampTourTargetRect(rect: RawRect, viewport: TourViewport): TourRect {
  const left = clamp(rect.left - TARGET_GAP, TARGET_GAP, viewport.width - TARGET_GAP);
  const right = clamp(rect.right + TARGET_GAP, TARGET_GAP, viewport.width - TARGET_GAP);
  const top = clamp(rect.top - TARGET_GAP, TARGET_GAP, viewport.height - TARGET_GAP);
  const bottom = clamp(rect.bottom + TARGET_GAP, TARGET_GAP, viewport.height - TARGET_GAP);
  return { top, left, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

export function positionTourCard(rect: TourRect, viewport: TourViewport): TourCardPosition {
  const width = Math.min(420, viewport.width - EDGE * 2);
  const height = Math.min(CARD_HEIGHT, viewport.height - EDGE * 2);
  const rightSide = rect.right + CARD_GAP;
  const leftSide = rect.left - CARD_GAP - width;

  if (rightSide + width <= viewport.width - EDGE) {
    return { left: rightSide, top: clamp(rect.top, EDGE, viewport.height - height - EDGE), width, height };
  }
  if (leftSide >= EDGE) {
    return { left: leftSide, top: clamp(rect.top, EDGE, viewport.height - height - EDGE), width, height };
  }

  const left = clamp(rect.left, EDGE, viewport.width - width - EDGE);
  const below = rect.bottom + CARD_GAP;
  const top = below + height <= viewport.height - EDGE
    ? below
    : clamp(rect.top - CARD_GAP - height, EDGE, viewport.height - height - EDGE);
  return { left, top, width, height };
}
