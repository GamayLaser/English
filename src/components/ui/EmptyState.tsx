import type { ReactNode } from "react";
import type { ThemeColors } from "../../types";

export default function EmptyState({
  c,
  title,
  description,
  action,
}: {
  c: ThemeColors;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border border-dashed px-5 py-12 text-center"
      style={{ borderColor: c.border, background: c.inputBg }}
    >
      <h3 className="text-base font-semibold" style={{ color: c.fg }}>
        {title}
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed" style={{ color: c.fgMuted }}>
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
