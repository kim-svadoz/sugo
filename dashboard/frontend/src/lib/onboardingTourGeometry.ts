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

/**
 * body에 CSS zoom(index.css의 1.1)이 걸려 있으면 getBoundingClientRect와 window.inner*는 확대된 화면 기준 값이고,
 * body 안에 그리는 fixed 요소의 top/left는 그 값에 zoom이 한 번 더 곱해진다. 그려질 좌표계로 되돌린다.
 */
export function rectInZoomedSpace(rect: RawRect, zoom: number): RawRect {
  const factor = zoom > 0 ? zoom : 1;
  return { top: rect.top / factor, left: rect.left / factor, right: rect.right / factor, bottom: rect.bottom / factor };
}

export function viewportInZoomedSpace(viewport: TourViewport, zoom: number): TourViewport {
  const factor = zoom > 0 ? zoom : 1;
  return { width: viewport.width / factor, height: viewport.height / factor };
}

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

export function positionTourCard(rect: TourRect, viewport: TourViewport, cardHeight = CARD_ESTIMATED_HEIGHT): TourCardPosition {
  const width = Math.min(420, viewport.width - EDGE * 2);
  const estimatedHeight = Math.min(cardHeight, viewport.height - EDGE * 2);
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
