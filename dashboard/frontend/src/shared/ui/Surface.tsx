import type { HTMLAttributes } from "react";
import { classNames } from "./classNames.js";

export function Surface({ level = "panel", className, ...props }: HTMLAttributes<HTMLDivElement> & { level?: "panel" | "raised" | "inset" }) {
  return <div {...props} className={classNames("ds-surface", `ds-surface--${level}`, className)} />;
}
