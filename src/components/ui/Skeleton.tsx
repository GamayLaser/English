import type { ThemeColors } from "../../types";

export default function Skeleton({
  c,
  className = "h-4 w-full rounded-lg",
}: {
  c: ThemeColors;
  className?: string;
}) {
  return (
    <div
      className={`animate-pulse ${className}`}
      style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}
      aria-hidden
    />
  );
}
