import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { ThemeColors } from "../../types";
import { englishSegmentClassName, englishSegmentedTabListProps, type EnglishButtonVariant } from "./englishUiStyles";
import { uiButtonClassName, uiButtonStyle, filterChipClassName, filterChipStyle, uiFocusRingClassName } from "../ui/styles";
import Card from "../ui/Card";

export interface EnglishSegment {
  id: string;
  label: ReactNode;
}

export function EnglishPageHeader({ eyebrow, title, description, aside, children, c }: { eyebrow?: string; title: ReactNode; description?: ReactNode; aside?: ReactNode; children?: ReactNode; c: ThemeColors }) {
  return <Card c={c} wash={c.accentDim}>
    <div className="p-5 md:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <p className="type-caption font-semibold tracking-[0.14em] uppercase" style={{ color: c.accent }}>{eyebrow}</p>}
          <h2 className="type-page mt-1" style={{ color: c.fg }}>{title}</h2>
          {description && <p className="type-secondary mt-1" style={{ color: c.fgMuted }}>{description}</p>}
        </div>
        {aside && <div className="flex flex-wrap items-center gap-2 shrink-0">{aside}</div>}
      </div>
      {children}
    </div>
  </Card>;
}

export function EnglishSegmentedTabs({ tabs, value, onChange, ariaLabel, c }: { tabs: EnglishSegment[]; value: string; onChange: (value: string) => void; ariaLabel: string; c: ThemeColors }) {
  return <div {...englishSegmentedTabListProps(ariaLabel)} className="flex flex-wrap gap-1 rounded-xl p-1" style={{ background: c.inputBg }}>
    {tabs.map((tab) => {
      const active = tab.id === value;
      return <button key={tab.id} type="button" role="tab" aria-selected={active} onClick={() => onChange(tab.id)} className={englishSegmentClassName(active)} style={{ background: active ? c.card : "transparent", color: active ? c.fg : c.fgMuted, border: `1px solid ${active ? c.border : "transparent"}` }}>{tab.label}</button>;
    })}
  </div>;
}

export function EnglishUnderlineTabs({ tabs, value, onChange, ariaLabel, c }: { tabs: readonly EnglishSegment[]; value: string; onChange: (value: string) => void; ariaLabel: string; c: ThemeColors }) {
  return <div role="tablist" aria-label={ariaLabel} className="zen-fade-mask zen-no-scrollbar flex items-end overflow-x-auto border-b" style={{ borderColor: c.border }}>
    {tabs.map((tab) => {
      const active = tab.id === value;
      return <button key={tab.id} type="button" role="tab" aria-selected={active} onClick={() => onChange(tab.id)} className={`relative shrink-0 px-4 pb-3 pt-1 text-sm font-semibold transition-colors ${uiFocusRingClassName}`} style={{ color: active ? c.fg : c.fgDim }}>
        {tab.label}
        {active && <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full" style={{ background: c.accent }} />}
      </button>;
    })}
  </div>;
}

export function EnglishFilterTabs({ tabs, value, onChange, ariaLabel, c }: { tabs: readonly EnglishSegment[]; value: string; onChange: (value: string) => void; ariaLabel: string; c: ThemeColors }) {
  return <div role="tablist" aria-label={ariaLabel} className="flex flex-wrap gap-2">
    {tabs.map((tab) => {
      const active = tab.id === value;
      return <button key={tab.id} type="button" role="tab" aria-selected={active} onClick={() => onChange(tab.id)} className={filterChipClassName()} style={filterChipStyle(active, c)}>
        {tab.label}
      </button>;
    })}
  </div>;
}

export function EnglishButton({ variant, c, className = "", style, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant: EnglishButtonVariant; c: ThemeColors }) {
  return <button {...props} className={`${uiButtonClassName(variant, props.disabled)} ${className}`} style={{ ...uiButtonStyle(variant, c), ...style }} />;
}

export function EnglishEmptyState({ title, description, action, c }: { title: string; description: string; action?: ReactNode; c: ThemeColors }) {
  return <div className="rounded-2xl border border-dashed px-5 py-12 text-center" style={{ borderColor: c.border, background: c.inputBg }}><h3 className="text-base font-semibold" style={{ color: c.fg }}>{title}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed" style={{ color: c.fgMuted }}>{description}</p>{action && <div className="mt-5">{action}</div>}</div>;
}

export function EnglishRecordCard({ title, subtitle, aside, open, onToggle, children, c }: { title: ReactNode; subtitle?: ReactNode; aside?: ReactNode; open: boolean; onToggle: () => void; children?: ReactNode; c: ThemeColors }) {
  return <article className="overflow-hidden rounded-xl" style={{ background: c.inputBg, border: `1px solid ${open ? `${c.accent}66` : c.borderSub}` }}>
    <button type="button" onClick={onToggle} className={`flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors ${uiFocusRingClassName}`}>
      <div className="min-w-0"><p className="text-sm font-semibold" style={{ color: c.fg }}>{title}</p>{subtitle && <p className="mt-1 text-xs leading-relaxed" style={{ color: c.fgMuted }}>{subtitle}</p>}</div>
      <div className="flex shrink-0 items-center gap-3">{aside}<span className="text-sm" style={{ color: c.accent }}>{open ? "收起" : "查看详情"}</span></div>
    </button>
    {open && children && <div className="border-t px-5 py-5" style={{ borderColor: c.border }}>{children}</div>}
  </article>;
}
