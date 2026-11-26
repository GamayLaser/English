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
  const tint = hueDim(hue, dark ? 0.14 : 0.09);
  const accent = dark ? "#E6A23C" : "#1C4532";
  return {
    bg: dark ? "#0B0D12" : "#F5F0E6",
    sidebar: dark ? "#13161E" : "#FAF7F0",
    card: dark ? "#13161E" : "#FAF7F0",
    cardHover: dark ? "#191D28" : "#FFFDF9",
    border: dark ? "rgba(255, 255, 255, 0.16)" : "#CFC4B0",
    borderSub: dark ? "rgba(255, 255, 255, 0.08)" : "#E2DACB",
    fg: dark ? "#ECEAE4" : "#1D231F",
    fgMuted: dark ? "#646B7A" : "#848C85",
    fgDim: dark ? "#646B7A" : "#848C85",
    fgSub: dark ? "#9CA3AF" : "#525B54",
    inputBg: dark ? "#1A1F2B" : "#EDE7DA",
    inputBorder: dark ? "rgba(255, 255, 255, 0.12)" : "#CFC4B0",
    active: dark ? "rgba(230, 162, 60, 0.14)" : "rgba(28, 69, 50, 0.08)",
    activeHover: dark ? "rgba(230, 162, 60, 0.22)" : "rgba(28, 69, 50, 0.14)",
    accent,
    accentDim: dark ? "rgba(230, 162, 60, 0.14)" : "rgba(28, 69, 50, 0.08)",
    accentFg: dark ? "#0B0D12" : "#FAF7F0",
    success: dark ? "#34D399" : "#2A6B4F",
    successDim: dark ? "rgba(52, 211, 153, 0.14)" : "rgba(42, 107, 79, 0.10)",
    successFg: dark ? "#06281a" : "#FFFFFF",
    warning: dark ? "#E6A23C" : "#B85A3A",
    warningDim: dark ? "rgba(230, 162, 60, 0.14)" : "rgba(184, 90, 58, 0.10)",
    warningFg: dark ? "#0B0D12" : "#FFFFFF",
    danger: dark ? "#F87171" : "#B43C3C",
    dangerDim: dark ? "rgba(248, 113, 113, 0.12)" : "rgba(180, 60, 60, 0.08)",
    dangerFg: "#FFFFFF",
    info: accent,
    infoDim: dark ? "rgba(230, 162, 60, 0.14)" : "rgba(28, 69, 50, 0.08)",
    infoFg: dark ? "#0B0D12" : "#FAF7F0",
    hue,
    hueDim: tint,
    avatarFrom: accent,
    avatarTo: dark ? "#D97706" : "#B85A3A",
    tabBar: dark ? "#13161E" : "#FAF7F0",
    shadow: dark
      ? "0 4px 20px rgba(0, 0, 0, 0.35)"
      : "0 2px 10px rgba(45, 38, 28, 0.04)",
  };
}
