import type { CSSProperties } from "react";
import type { ThemeColors } from "../../types";

export type UiButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export const uiFocusRingClassName =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/40";

export function uiButtonClassName(variant: UiButtonVariant, disabled = false) {
  const base = `inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl px-3.5 py-1.5 text-[13px] font-medium tracking-[-0.005em] transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 disabled:hover:translate-y-0 cursor-pointer ${uiFocusRingClassName}`;
  const motion =
    variant === "primary"
      ? " ui-btn-primary"
      : variant === "danger"
        ? " ui-btn-danger"
        : variant === "ghost"
          ? " ui-btn-ghost"
          : " ui-btn-secondary";
  return `${base}${motion}${disabled ? " cursor-not-allowed" : ""}`;
}

export function uiIconButtonClassName() {
  return `inline-grid size-9 shrink-0 place-items-center rounded-xl ui-btn-ghost transition-all cursor-pointer ${uiFocusRingClassName}`;
}

export function filterChipClassName(compact = false) {
  return `inline-flex items-center justify-center gap-1 rounded-lg font-medium transition-colors cursor-pointer ${uiFocusRingClassName} ${
    compact ? "min-h-7 px-2.5 text-[12px]" : "min-h-8 px-3 text-[12.5px]"
  }`;
}

export function filterChipStyle(active: boolean, c: ThemeColors): CSSProperties {
  return active
    ? {
        background: c.accentDim,
        color: c.accent,
        border: `1px solid ${c.accentDim}`,
      }
    : {
        background: "transparent",
        color: c.fgMuted,
        border: `1px solid ${c.borderSub}`,
      };
}

export function uiButtonStyle(variant: UiButtonVariant, c: ThemeColors): CSSProperties {
  switch (variant) {
    case "primary":
      return { background: c.accent, color: c.accentFg };
    case "secondary":
      return {
        background: c.card,
        border: `1px solid ${c.border}`,
        color: c.fg,
      };
    case "danger":
      return {
        background: c.dangerDim,
        border: `1px solid ${c.dangerDim}`,
        color: c.danger,
      };
    case "ghost":
      return { color: c.fgMuted };
  }
}

export function uiFieldClassName() {
  return `min-h-9 w-full rounded-xl px-3.5 py-2 text-[13.5px] outline-none transition-colors ${uiFocusRingClassName}`;
}

export function uiFieldStyle(c: ThemeColors): CSSProperties {
  return {
    background: c.inputBg,
    border: `1px solid ${c.inputBorder}`,
    color: c.fg,
  };
}
