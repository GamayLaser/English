export type CategoryHue = "slate" | "red" | "amber" | "green" | "teal" | "blue" | "violet" | "pink";

export interface ThemeColors {
  bg: string;
  sidebar: string;
  card: string;
  cardHover: string;
  border: string;
  borderSub: string;
  fg: string;
  fgMuted: string;
  fgDim: string;
  fgSub: string;
  inputBg: string;
  inputBorder: string;
  active: string;
  activeHover: string;
  accent: string;
  accentDim: string;
  accentFg: string;
  success: string;
  successDim: string;
  successFg: string;
  warning: string;
  warningDim: string;
  warningFg: string;
  danger: string;
  dangerDim: string;
  dangerFg: string;
  info: string;
  infoDim: string;
  infoFg: string;
  hue: Record<CategoryHue, string>;
  hueDim: Record<CategoryHue, string>;
  avatarFrom: string;
  avatarTo: string;
  tabBar: string;
  shadow: string;
}

export type Theme = "dark" | "light";
