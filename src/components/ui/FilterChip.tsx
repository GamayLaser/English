import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { ThemeColors } from "../../types";
import { filterChipClassName, filterChipStyle } from "./styles";

export default function FilterChip({
  active,
  c,
  compact = false,
  className = "",
  style,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean; c: ThemeColors; compact?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      {...props}
      className={`${filterChipClassName(compact)} ${className}`}
      style={{ ...filterChipStyle(active, c), ...style }}
    >
      {children}
    </button>
  );
}
