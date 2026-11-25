import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import type { ThemeColors } from "../../types";
import { uiFieldClassName, uiFieldStyle } from "./styles";

export function Input({
  c,
  className = "",
  style,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { c: ThemeColors }) {
  return (
    <input
      {...props}
      className={`${uiFieldClassName()} ${className}`}
      style={{ ...uiFieldStyle(c), ...style }}
    />
  );
}

export function Textarea({
  c,
  className = "",
  style,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { c: ThemeColors }) {
  return (
    <textarea
      {...props}
      className={`${uiFieldClassName()} resize-y leading-6 ${className}`}
      style={{ ...uiFieldStyle(c), ...style }}
    />
  );
}
