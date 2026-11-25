import type { ReactNode } from "react";
import type { ThemeColors } from "../../types";
import { uiFieldClassName, uiFieldStyle, uiFocusRingClassName } from "./styles";

export default function SearchField({
  c,
  value,
  onChange,
  placeholder,
  label,
  trailing,
  className = "",
}: {
  c: ThemeColors;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <label className={`relative block w-full ${className}`}>
      <span className="sr-only">{label}</span>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 fill-none stroke-current"
        style={{ color: c.fgMuted }}
        strokeWidth="2"
      >
        <circle cx="11" cy="11" r="6" />
        <path d="m16 16 4 4" />
      </svg>
      <input
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={uiFieldClassName()}
        style={{ ...uiFieldStyle(c), caretColor: c.accent, paddingLeft: "2.5rem", paddingRight: trailing || value ? "6.5rem" : "1rem" }}
      />
      <span className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className={`rounded-lg px-2 py-1 type-caption ui-btn-ghost ${uiFocusRingClassName}`}
            style={{ color: c.fgMuted }}
          >
            清除
          </button>
        )}
        {trailing}
      </span>
    </label>
  );
}
