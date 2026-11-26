import type { CategoryHue, Theme, ThemeColors } from "../types";

const HUE_DARK: Record<CategoryHue, string> = {
  slate: "#94a3b8",
  red: "#f87171",
  amber: "#fbbf24",
  green: "#34d399",
  teal: "#2dd4bf",
  blue: "#60a5fa",
  violet: "#a78bfa",
  pink: "#f472b6",
};

const HUE_LIGHT: Record<CategoryHue, string> = {
  slate: "#64748b",
  red: "#ef4444",
  amber: "#d97706",
  green: "#059669",
  teal: "#0d9488",
  blue: "#2563eb",
  violet: "#7c3aed",
  pink: "#db2777",
};

function dim(hex: string, alpha: number): string {
  const n = hex.slice(1);
  const r = Number.parseInt(n.slice(0, 2), 16);
  const g = Number.parseInt(n.slice(2, 4), 16);
  const b = Number.parseInt(n.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hueDim(source: Record<CategoryHue, string>, alpha: number): Record<CategoryHue, string> {
  return {
    slate: dim(source.slate, alpha),
    red: dim(source.red, alpha),
    amber: dim(source.amber, alpha),
    green: dim(source.green, alpha),
    teal: dim(source.teal, alpha),
    blue: dim(source.blue, alpha),
    violet: dim(source.violet, alpha),
    pink: dim(source.pink, alpha),
  };
}

export function hueOf(c: ThemeColors, hue: CategoryHue): string {
  return c.hue?.[hue] ?? HUE_DARK[hue];
}

export function hueDimOf(c: ThemeColors, hue: CategoryHue): string {
  return c.hueDim?.[hue] ?? dim(HUE_DARK[hue], 0.14);
}

export function buildTheme(mode: Theme): ThemeColors {
  const dark = mode === "dark";
  const hue = dark ? HUE_DARK : HUE_LIGHT;
  const tint = hueDim(hue, dark ? 0.15 : 0.09);
  const accent = dark ? "#60A5FA" : "#2563EB";
  return {
    bg: dark ? "#0B1120" : "#F6F7F9",
    sidebar: dark ? "#0F172A" : "#FFFFFF",
    card: dark ? "#162032" : "#FFFFFF",
    cardHover: dark ? "#1E293B" : "#F8FAFC",
    border: dark ? "rgba(148, 163, 184, 0.14)" : "#D5DBE5",
    borderSub: dark ? "rgba(148, 163, 184, 0.08)" : "#E6E9EF",
    fg: dark ? "#F1F5F9" : "#111827",
    fgMuted: dark ? "#94A3B8" : "#8B95A5",
    fgDim: dark ? "#64748B" : "#94A3B8",
    fgSub: dark ? "#CBD5E1" : "#4B5563",
    inputBg: dark ? "#1E293B" : "#F1F4F8",
    inputBorder: dark ? "rgba(148, 163, 184, 0.18)" : "#D5DBE5",
    active: dark ? "rgba(148, 163, 184, 0.10)" : "#F1F4F8",
    activeHover: dark ? "rgba(148, 163, 184, 0.16)" : "#E6E9EF",
    accent,
    accentDim: dark ? "rgba(96, 165, 250, 0.15)" : "#EFF6FF",
    accentFg: dark ? "#0B1120" : "#FFFFFF",
    success: hue.green,
    successDim: tint.green,
    successFg: dark ? "#06281a" : "#FFFFFF",
    warning: hue.amber,
    warningDim: tint.amber,
    warningFg: dark ? "#1c1408" : "#FFFFFF",
    danger: hue.red,
    dangerDim: tint.red,
    dangerFg: "#FFFFFF",
    info: hue.blue,
    infoDim: tint.blue,
    infoFg: "#FFFFFF",
    hue,
    hueDim: tint,
    avatarFrom: accent,
    avatarTo: accent,
    tabBar: dark ? "#0F172A" : "#FFFFFF",
    shadow: dark
      ? "inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 20px -4px rgba(0,0,0,0.45)"
      : "0 1px 2px rgba(15, 23, 42, 0.04)",
  };
}
