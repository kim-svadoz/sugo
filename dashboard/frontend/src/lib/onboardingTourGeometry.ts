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
  maxHeight: number;
}

const EDGE = 16;
const TARGET_GAP = 4;
const CARD_GAP = 14;
const CARD_ESTIMATED_HEIGHT = 220;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function clampTourTargetRect(rect: RawRect, viewport: TourViewport, requestedGap = TARGET_GAP): TourRect {
  const gap = Math.max(0, requestedGap);
  const left = clamp(rect.left - gap, gap, viewport.width - gap);
  const right = clamp(rect.right + gap, gap, viewport.width - gap);
  const top = clamp(rect.top - gap, gap, viewport.height - gap);
  const bottom = clamp(rect.bottom + gap, gap, viewport.height - gap);
  return { top, left, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

export function positionTourCard(rect: TourRect, viewport: TourViewport): TourCardPosition {
  const width = Math.min(420, viewport.width - EDGE * 2);
  const estimatedHeight = Math.min(CARD_ESTIMATED_HEIGHT, viewport.height - EDGE * 2);
  const rightSide = rect.right + CARD_GAP;
  const leftSide = rect.left - CARD_GAP - width;
  const place = (left: number, top: number): TourCardPosition => ({
    left,
    top,
    width,
    maxHeight: viewport.height - top - EDGE,
  });

  if (rightSide + width <= viewport.width - EDGE) {
    return place(rightSide, clamp(rect.top, EDGE, viewport.height - estimatedHeight - EDGE));
  }
  if (leftSide >= EDGE) {
    return place(leftSide, clamp(rect.top, EDGE, viewport.height - estimatedHeight - EDGE));
  }

  const left = clamp(rect.left, EDGE, viewport.width - width - EDGE);
  const below = rect.bottom + CARD_GAP;
  const top = below + estimatedHeight <= viewport.height - EDGE
    ? below
    : clamp(rect.top - CARD_GAP - estimatedHeight, EDGE, viewport.height - estimatedHeight - EDGE);
  return place(left, top);
}
