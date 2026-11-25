import { uiButtonClassName, uiFocusRingClassName, uiIconButtonClassName, type UiButtonVariant } from "../ui/styles";

export type EnglishButtonVariant = UiButtonVariant;

export function englishButtonClassName(variant: EnglishButtonVariant, disabled = false) {
  return uiButtonClassName(variant, disabled);
}

export function englishSegmentClassName(active: boolean) {
  return `min-h-8 min-w-0 flex-1 rounded-lg px-3 py-1.5 text-[13px] transition ${uiFocusRingClassName} ${active ? "font-semibold" : "font-medium"}`;
}

export function englishSegmentedTabListProps(label: string) {
  return { role: "tablist" as const, "aria-label": label };
}

export function englishIconButtonClassName() {
  return uiIconButtonClassName();
}
