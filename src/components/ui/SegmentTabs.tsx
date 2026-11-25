import type { ReactNode } from "react";
import type { ThemeColors } from "../../types";
import { uiFocusRingClassName } from "./styles";

export type UiTab = { id: string; label: ReactNode };

export default function SegmentTabs({
  tabs,
  value,
  onChange,
  ariaLabel,
  c,
  compact = false,
  className = "",
}: {
  tabs: readonly UiTab[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  c: ThemeColors;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex flex-wrap gap-1 rounded-xl p-1 ${compact ? "w-fit" : ""} ${className}`}
      style={{ background: c.inputBg }}
    >
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`min-h-11 min-w-0 rounded-lg px-3 py-2 type-body transition ${compact ? "" : "flex-1"} ${uiFocusRingClassName} ${active ? "font-medium" : ""}`}
            style={{
              background: active ? c.card : "transparent",
              color: active ? c.fg : c.fgMuted,
              border: `1px solid ${active ? c.border : "transparent"}`,
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
