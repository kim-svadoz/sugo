import type { HTMLAttributes } from "react";
import { classNames } from "./classNames.js";

export type BadgeTone = "neutral" | "brand" | "success" | "progress" | "warning" | "danger";

export function Badge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span {...props} className={classNames("ds-badge", `ds-badge--${tone}`, className)} />;
}
