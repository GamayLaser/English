export interface SelectionSnapshot {
  text: string;
  anchorLineId: string | null;
  focusLineId: string | null;
}

export function getLineSelection(snapshot: SelectionSnapshot, lineId: string) {
  const text = snapshot.text.trim();
  return text && snapshot.anchorLineId === lineId && snapshot.focusLineId === lineId ? text : null;
}
