import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import type { VocabEntry } from "@shared/schemas";
import { tokenizeVocabMatches, type VocabMatcher } from "../../features/vocab/vocabMatcher";
import { getCardImageUrl, speakVocabText } from "../../features/vocab/vocabStore";
import type { ThemeColors } from "../../types";

export type VocabCardAnchor = {
  entry: VocabEntry;
  x: number;
  y: number;
  above: boolean;
  contextSentence: string;
};

export function placeVocabCard(
  entry: VocabEntry,
  event: MouseEvent<HTMLElement>,
  contextSentence: string,
): VocabCardAnchor | null {
  const selection = window.getSelection();
  if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) return null;
  event.stopPropagation();
  const rect = event.currentTarget.getBoundingClientRect();
  const cardWidth = 304;
  const x = Math.min(
    Math.max(cardWidth / 2 + 12, rect.left + rect.width / 2),
    window.innerWidth - cardWidth / 2 - 12,
  );
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  const above = spaceBelow < 380 && spaceAbove > spaceBelow;
  const y = above ? Math.max(12, rect.top - 8) : Math.min(window.innerHeight - 12, rect.bottom + 8);
  return { entry, x, y, above, contextSentence };
}

export function VocabLinkedText({
  text,
  matcher,
  excludedIds,
  className,
  hitClassName,
  onOpen,
}: {
  text: string;
  matcher: VocabMatcher | null;
  excludedIds?: Set<string>;
  className?: string;
  hitClassName?: string;
  onOpen: (entry: VocabEntry, event: MouseEvent<HTMLElement>, sentence: string) => void;
}) {
  const tokens = useMemo(
    () => tokenizeVocabMatches(text, matcher, { excludedIds }),
    [text, matcher, excludedIds],
  );
  return (
    <>
      {tokens.map((token, index) =>
        token.entry ? (
          <span
            key={`${index}-${token.text}`}
            className={hitClassName ?? "novel-vocab-hit"}
            onClick={(event) => onOpen(token.entry!, event, text)}
          >
            {token.text}
          </span>
        ) : (
          <span key={`${index}-plain`} className={className}>
            {token.text}
          </span>
        ),
      )}
    </>
  );
}

export function VocabCardPopover({
  c,
  card,
  bookmarked,
  mastered,
  cdnBaseUrl,
  onClose,
  onToggleBookmark,
  onToggleMastered,
}: {
  c: ThemeColors;
  card: VocabCardAnchor | null;
  bookmarked: boolean;
  mastered: boolean;
  cdnBaseUrl: string;
  onClose: () => void;
  onToggleBookmark: (entry: VocabEntry, contextSentence: string) => void;
  onToggleMastered: (entryId: string) => void;
}) {
  const [imgOk, setImgOk] = useState(true);
  useEffect(() => {
    setImgOk(true);
  }, [card?.entry.id]);
  if (!card || typeof document === "undefined") return null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-[55]" onClick={onClose} aria-hidden="true" />
      <div
        className={`fixed z-[60] w-[304px] max-h-[82vh] overflow-y-auto -translate-x-1/2 rounded-2xl p-4 zen-card zen-modal space-y-3 ${card.above ? "-translate-y-full" : ""}`}
        style={{ left: card.x, top: card.y }}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: "var(--bg-subtle)", color: "var(--text-muted)" }}
          >
            {card.entry.topic || "词卡联动"}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onToggleBookmark(card.entry, card.contextSentence)}
              className="rounded-lg px-2 py-1 text-xs font-medium cursor-pointer"
              style={{
                background: bookmarked ? c.accentDim : "var(--bg-subtle)",
                color: bookmarked ? c.accent : c.fgMuted,
              }}
            >
              {bookmarked ? "已收藏 ★" : "收藏"}
            </button>
            <button
              type="button"
              onClick={() => onToggleMastered(card.entry.id)}
              className="rounded-lg px-2 py-1 text-xs font-medium cursor-pointer"
              style={{
                background: mastered ? c.successDim : "var(--bg-subtle)",
                color: mastered ? c.success : c.fgMuted,
              }}
            >
              {mastered ? "已掌握 ✓" : "掌握"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-1.5 py-1 text-xs cursor-pointer"
              style={{ color: c.fgMuted }}
              aria-label="关闭单词卡片"
            >
              ✕
            </button>
          </div>
        </div>

        {imgOk && (
          <div className="w-full aspect-[4/3] overflow-hidden rounded-xl flex items-center justify-center">
            <img
              src={getCardImageUrl(card.entry, cdnBaseUrl)}
              alt={card.entry.word}
              className="vocab-card-img"
              onError={() => setImgOk(false)}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-lg font-bold leading-snug" style={{ color: "var(--text-primary)" }} lang="en">
              {card.entry.word}
            </h4>
            <button
              type="button"
              onClick={() => speakVocabText(card.entry.audioText || card.entry.word, 0.95)}
              className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium cursor-pointer"
              style={{ background: c.accentDim, color: c.accent }}
            >
              朗读
            </button>
          </div>
          <div className="flex items-baseline gap-2 text-sm">
            {card.entry.pos && (
              <span
                className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold"
                style={{ background: c.accentDim, color: c.accent }}
              >
                {card.entry.pos}
              </span>
            )}
            <span style={{ color: "var(--text-secondary)" }}>{card.entry.definition}</span>
          </div>
          {card.entry.sentence && (
            <p
              className="rounded-xl px-3 py-2 text-xs leading-relaxed mt-1"
              style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}
              lang="en"
            >
              {card.entry.sentence}
            </p>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
