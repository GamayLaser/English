import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import type { ThemeColors } from "../../types";

export function cardWashStyle(wash: string): CSSProperties {
  return { "--card-wash": wash } as CSSProperties;
}

export default function Card({
  c,
  children,
  hover = false,
  wash,
  className = "",
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & { c: ThemeColors; hover?: boolean; wash?: string; children: ReactNode }) {
  void c;
  return (
    <div
      {...props}
      className={`rounded-2xl zen-card ${hover ? "zen-card-hover" : ""} ${wash ? "zen-card-wash" : ""} ${className}`}
      style={{ ...(wash ? cardWashStyle(wash) : {}), ...style }}
    >
      {children}
    </div>
  );
}
