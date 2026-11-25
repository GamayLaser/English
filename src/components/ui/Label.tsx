import type { LabelHTMLAttributes, ReactNode } from "react";
import type { ThemeColors } from "../../types";

export default function Label({
  c,
  children,
  className = "",
  ...props
}: LabelHTMLAttributes<HTMLLabelElement> & { c: ThemeColors; children: ReactNode }) {
  return (
    <label {...props} className={`block text-sm font-medium ${className}`} style={{ color: c.fg }}>
      {children}
    </label>
  );
}

export function FieldError({ message, c }: { message?: string; c: ThemeColors }) {
  if (!message) return null;
  return (
    <p className="mt-1.5 text-xs font-medium" style={{ color: c.danger }} role="alert">
      {message}
    </p>
  );
}
