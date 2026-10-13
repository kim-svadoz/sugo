import { useRef, type KeyboardEvent, type TextareaHTMLAttributes } from "react";
import { applyMarkdownEnter, applyMarkdownTab } from "../lib/markdownEditing.js";

export function MarkdownTextarea({ value, onValueChange, className, ...props }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function apply(edit: { value: string; selectionStart: number; selectionEnd: number }) {
    onValueChange(edit.value);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(edit.selectionStart, edit.selectionEnd);
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Tab") {
      event.preventDefault();
      apply(applyMarkdownTab(value, event.currentTarget.selectionStart, event.currentTarget.selectionEnd, event.shiftKey));
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      const edit = applyMarkdownEnter(value, event.currentTarget.selectionStart, event.currentTarget.selectionEnd);
      if (edit) { event.preventDefault(); apply(edit); }
    }
  }

  return <textarea ref={ref} value={value} onChange={(event) => onValueChange(event.target.value)} onKeyDown={onKeyDown} className={className} {...props} />;
}
