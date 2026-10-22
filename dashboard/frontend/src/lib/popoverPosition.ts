export interface PopoverRect {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

export function placePopover(
  trigger: PopoverRect,
  panel: { width: number; height: number },
  viewport: { width: number; height: number },
  margin = 12,
  gap = 4,
): { top: number; left: number; placement: "top" | "bottom" } {
  const spaceBelow = viewport.height - trigger.bottom - margin;
  const placement = spaceBelow >= panel.height || trigger.top < panel.height + gap + margin ? "bottom" : "top";
  const desiredTop = placement === "bottom" ? trigger.bottom + gap : trigger.top - panel.height - gap;
  return {
    top: Math.max(margin, Math.min(desiredTop, viewport.height - panel.height - margin)),
    left: Math.max(margin, Math.min(trigger.left, viewport.width - panel.width - margin)),
    placement,
  };
}
