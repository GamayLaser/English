import type { ReactNode } from "react";
import type { ThemeColors } from "../../types";

export default function PageHeader({
  c,
  eyebrow,
  title,
  description,
  aside,
}: {
  c: ThemeColors;
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="type-caption font-medium" style={{ color: c.accent }}>
            {eyebrow}
          </p>
        )}
        <h1 className="type-page" style={{ color: c.fg }}>
          {title}
        </h1>
        {description && (
          <p className="type-secondary mt-1.5" style={{ color: c.fgMuted }}>
            {description}
          </p>
        )}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </header>
  );
}
