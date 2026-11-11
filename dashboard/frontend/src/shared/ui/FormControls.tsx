import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { classNames } from "./classNames.js";

type FieldShellProps = { label?: string; hint?: string; error?: string; children: React.ReactNode };

function FieldShell({ label, hint, error, children }: FieldShellProps) {
  return <label className="ds-field-shell">
    {label && <span className="ds-field-label">{label}</span>}
    {children}
    {(error || hint) && <span className={classNames("ds-field-hint", error && "ds-field-hint--error")}>{error || hint}</span>}
  </label>;
}

export const TextField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & Omit<FieldShellProps, "children">>(
  ({ label, hint, error, className, ...props }, ref) => <FieldShell label={label} hint={hint} error={error}>
    <input {...props} ref={ref} className={classNames("ds-field", error && "ds-field--error", className)} aria-invalid={error ? true : undefined} />
  </FieldShell>,
);

export const SelectField = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & Omit<FieldShellProps, "children">>(
  ({ label, hint, error, className, children, ...props }, ref) => <FieldShell label={label} hint={hint} error={error}>
    <select {...props} ref={ref} className={classNames("ds-field", "ds-select", error && "ds-field--error", className)} aria-invalid={error ? true : undefined}>{children}</select>
  </FieldShell>,
);

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & Omit<FieldShellProps, "children">>(
  ({ label, hint, error, className, ...props }, ref) => <FieldShell label={label} hint={hint} error={error}>
    <textarea {...props} ref={ref} className={classNames("ds-field", "ds-textarea", error && "ds-field--error", className)} aria-invalid={error ? true : undefined} />
  </FieldShell>,
);

TextField.displayName = "TextField";
SelectField.displayName = "SelectField";
TextAreaField.displayName = "TextAreaField";
