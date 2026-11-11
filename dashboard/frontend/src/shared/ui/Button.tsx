import type { ButtonHTMLAttributes, ReactNode } from "react";
import { classNames } from "./classNames.js";

export type ButtonRole = "brand" | "neutral" | "danger" | "warning";
export type ButtonEmphasis = "solid" | "soft" | "ghost";
export type ButtonSize = "medium" | "small" | "xsmall";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "role"> {
  role?: ButtonRole;
  emphasis?: ButtonEmphasis;
  size?: ButtonSize;
  loading?: boolean;
  block?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

/** Console action primitive: role × emphasis × size. */
export function Button({
  role = "neutral",
  emphasis = "soft",
  size = "medium",
  loading = false,
  block = false,
  leadingIcon,
  trailingIcon,
  className,
  disabled,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={classNames("ds-button", `ds-button--${role}`, `ds-button--${emphasis}`, `ds-button--${size}`, block && "ds-button--block", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {leadingIcon && <span className="ds-button__icon">{leadingIcon}</span>}
      <span>{children}</span>
      {trailingIcon && <span className="ds-button__icon">{trailingIcon}</span>}
      {loading && <span className="ds-spinner" aria-hidden="true" />}
    </button>
  );
}
