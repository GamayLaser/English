import { useCallback, useEffect, useMemo, useState } from "react";
import type { VocabCategoryMeta, VocabEntry } from "@shared/schemas";
import { Button, Card, EmptyState, FilterChip, Modal, SearchField } from "../components/ui";
import { api } from "../lib/api";
import type { ThemeColors } from "../types";
import {
  dialogueLines,
  getCardImageUrl,
  getEntryMode,
  loadAllVocabEntries,
  loadCategoryEntries,
  loadVocabIndex,
  loadVocabProgress,
  saveVocabBookmarks,
  saveVocabMastered,
  saveVocabSpeed,
  speakVocabText,
  type VocabMode,
} from "../features/vocab/vocabStore";

const MODE_META: Record<
  VocabMode,
  { eyebrow: string; title: string; subtitle: string; searchPlaceholder: string }
> = {
  word: {
    eyebrow: "Visual Words",
    title: "单词词卡",
    subtitle: "结合插画与高频例句记忆核心日常单词，支持 3D 翻卡与 A4 打印。",
    searchPlaceholder: "搜索英文单词、中文释义或例句…",
  },
  phrase: {
    eyebrow: "Useful Phrases",
    title: "词组搭配",
    subtitle: "聚焦动词短语、介词搭配与高频习惯表达。",
    searchPlaceholder: "搜索英文词组、搭配或例句…",
  },
  sentence: {
    eyebrow: "Everyday Sentences",
    title: "情景句子",
    subtitle: "按真实生活场景分组的短对话与高频句型。",
    searchPlaceholder: "搜索英文句子、对话或情境…",
  },
};

const STATUS_FILTERS = [
  { id: "all", label: "全部" },
  { id: "bookmarked", label: "已收藏" },
  { id: "mastered", label: "已掌握" },
  { id: "unmastered", label: "待复习" },
] as const;

const SPEEDS = [1.0, 1.2, 0.8];

function SpeakerIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
    </svg>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

export default function CardsPage({ mode, c }: { mode: VocabMode; c: ThemeColors }) {
  const meta = MODE_META[mode];
  const [categories, setCategories] = useState<VocabCategoryMeta[]>([]);
  const [entries, setEntries] = useState<VocabEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [cdnBaseUrl, setCdnBaseUrl] = useState("");

  const [currentCategory, setCurrentCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sentenceTopic, setSentenceTopic] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");

  const initial = useMemo(() => loadVocabProgress(), []);
  const [speed, setSpeed] = useState<number>(initial.speed);
  const [bookmarked, setBookmarked] = useState<Set<string>>(initial.bookmarked);
  const [mastered, setMastered] = useState<Set<string>>(initial.mastered);

  const [flashcardOpen, setFlashcardOpen] = useState(false);
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [shuffledOrder, setShuffledOrder] = useState<VocabEntry[] | null>(null);

  useEffect(() => {
    api.health().then((h) => setCdnBaseUrl(h.cardsCdnUrl || "")).catch(() => undefined);
    loadVocabIndex().then(setCategories).catch(() => undefined);
  }, []);

  useEffect(() => {
    setActiveFilter("all");
    setSearchQuery("");
    setSentenceTopic("");
    if (!categories.length) return;
    if (mode === "sentence") {
      const sentenceCat = categories.find((cat) => cat.group === "sentence");
      if (sentenceCat) setCurrentCategory(sentenceCat.id);
    } else {
      setCurrentCategory("all");
    }
  }, [mode, categories]);

  useEffect(() => {
    if (!categories.length) return;
    let active = true;
    setLoading(true);
    const loader =
      currentCategory === "all"
        ? loadAllVocabEntries(categories)
        : loadCategoryEntries(currentCategory);
    loader
      .then((list) => {
        if (active) setEntries(list);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [categories, currentCategory]);

  const filteredCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return entries.filter((item) => {
      if (getEntryMode(item) !== mode) return false;
      if (mode === "sentence" && sentenceTopic && item.topic !== sentenceTopic) return false;

      if (activeFilter === "bookmarked" && !bookmarked.has(item.id)) return false;
      if (activeFilter === "mastered" && !mastered.has(item.id)) return false;
      if (activeFilter === "unmastered" && mastered.has(item.id)) return false;

      if (!q) return true;
      return (
        item.word.toLowerCase().includes(q) ||
        item.definition.toLowerCase().includes(q) ||
        (item.sentence || "").toLowerCase().includes(q) ||
        (item.pattern || "").toLowerCase().includes(q)
      );
    });
  }, [entries, mode, sentenceTopic, activeFilter, bookmarked, mastered, searchQuery]);

  const visibleCategories = useMemo(() => {
    return categories.filter((cat) => {
      if (mode === "sentence" && cat.group !== "sentence") return false;
      if (mode !== "sentence" && cat.group === "sentence") return false;
      return true;
    });
  }, [categories, mode]);

  const sentenceTopics = useMemo(() => {
    const set = new Set<string>();
    for (const item of entries) {
      if (item.entryType === "sentence" && item.topic) set.add(item.topic);
    }
    return [...set];
  }, [entries]);

  const toggleBookmark = useCallback((id: string) => {
    setBookmarked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveVocabBookmarks(next);
      return next;
    });
  }, []);

  const toggleMastered = useCallback((id: string) => {
    setMastered((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveVocabMastered(next);
      return next;
    });
  }, []);

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    saveVocabSpeed(next);
  };

  const flashcardList = shuffledOrder ?? filteredCards;
  const activeFlashcard = flashcardList[flashcardIndex] ?? null;

  useEffect(() => {
    if (!flashcardOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFlashcardOpen(false);
      else if (e.key === " ") {
        e.preventDefault();
        setIsFlipped((f) => !f);
      } else if (e.key === "ArrowRight") {
        setIsFlipped(false);
        setFlashcardIndex((i) => Math.min(flashcardList.length - 1, i + 1));
      } else if (e.key === "ArrowLeft") {
        setIsFlipped(false);
        setFlashcardIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [flashcardOpen, flashcardList.length]);

  const openFlashcards = () => {
    if (!filteredCards.length) return;
    setShuffledOrder(null);
    setFlashcardIndex(0);
    setIsFlipped(false);
    setFlashcardOpen(true);
  };

  const shuffleFlashcards = () => {
    const copy = [...filteredCards];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    setShuffledOrder(copy);
    setFlashcardIndex(0);
    setIsFlipped(false);
  };

  const printSheets = useMemo(() => {
    const sheets: VocabEntry[][] = [];
    const perSheet = mode === "sentence" ? 8 : 16;
    for (let i = 0; i < filteredCards.length; i += perSheet) {
      sheets.push(filteredCards.slice(i, i + perSheet));
    }
    return sheets;
  }, [filteredCards, mode]);

  return (
    <div className="space-y-5 pb-8">
      <div className="no-print space-y-5">
        {/* Top Hero & Controls */}
        <Card c={c} wash={c.accentDim}>
          <div className="p-5 md:p-6 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="type-caption font-medium" style={{ color: c.accent }}>
                  {meta.eyebrow}
                </p>
                <h2 className="type-page mt-1" style={{ color: c.fg }}>
                  {meta.title}
                </h2>
                <p className="type-secondary mt-1.5" style={{ color: c.fgMuted }}>
                  {meta.subtitle}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button c={c} variant="secondary" onClick={() => window.print()}>
                  打印 A4
                </Button>
                <Button c={c} variant="secondary" onClick={cycleSpeed}>
                  语速 {speed.toFixed(1)}x
                </Button>
                <Button
                  c={c}
                  variant="primary"
                  onClick={openFlashcards}
                  disabled={!filteredCards.length}
                >
                  翻卡练习 ({filteredCards.length})
                </Button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
              <div className="flex-1">
                <SearchField
                  c={c}
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder={meta.searchPlaceholder}
                  label={meta.title}
                />
              </div>
              {mode !== "sentence" ? (
                <select
                  value={currentCategory}
                  onChange={(e) => setCurrentCategory(e.target.value)}
                  className="min-h-9 rounded-xl border px-3 py-1.5 text-[13px] font-medium outline-none sm:w-64"
                  style={{ background: c.inputBg, borderColor: c.inputBorder, color: c.fg }}
                  aria-label="选择主题分类"
                >
                  <option value="all">全部主题 ({visibleCategories.length})</option>
                  {visibleCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.nameEn} ({cat.count})
                    </option>
                  ))}
                </select>
              ) : (
                sentenceTopics.length > 0 && (
                  <select
                    value={sentenceTopic}
                    onChange={(e) => setSentenceTopic(e.target.value)}
                    className="min-h-9 rounded-xl border px-3 py-1.5 text-[13px] font-medium outline-none sm:w-56"
                    style={{ background: c.inputBg, borderColor: c.inputBorder, color: c.fg }}
                  >
                    <option value="">全部情境 ({sentenceTopics.length})</option>
                    {sentenceTopics.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                )
              )}
            </div>

          </div>
        </Card>

        {/* Full-Width Cards Viewport */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3.5 px-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {STATUS_FILTERS.map((chip) => (
                <FilterChip
                  key={chip.id}
                  c={c}
                  compact
                  active={activeFilter === chip.id}
                  onClick={() => setActiveFilter(chip.id)}
                >
                  {chip.label}
                </FilterChip>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <p className="type-secondary zen-tnum" style={{ color: c.fgMuted }}>
                共 {filteredCards.length} 条记录
              </p>
              {(searchQuery || activeFilter !== "all" || sentenceTopic) && (
                <Button
                  c={c}
                  variant="ghost"
                  onClick={() => {
                    setSearchQuery("");
                    setActiveFilter("all");
                    setSentenceTopic("");
                  }}
                >
                  重置筛选
                </Button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="py-20 text-center type-secondary" style={{ color: c.fgMuted }}>
              正在加载词卡…
            </div>
          ) : filteredCards.length === 0 ? (
            <EmptyState
              c={c}
              title="没有找到匹配的卡片"
              description="试试调整关键词，或清除当前筛选条件。"
              action={
                <Button
                  c={c}
                  variant="secondary"
                  onClick={() => {
                    setSearchQuery("");
                    setActiveFilter("all");
                    setSentenceTopic("");
                  }}
                >
                  查看全部
                </Button>
              }
            />
          ) : (
            <div
              className={
                mode === "sentence"
                  ? "grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4"
                  : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4"
              }
            >
                {filteredCards.map((item) => {
                  const isBookmarked = bookmarked.has(item.id);
                  const isMastered = mastered.has(item.id);
                  return (
                    <Card
                      key={item.id}
                      c={c}
                      hover
                      className="overflow-hidden flex flex-col justify-between"
                    >
                      {item.entryType !== "sentence" && (
                        <div
                          onClick={() => speakVocabText(item.audioText || item.word, speed)}
                          className="h-32 cursor-pointer overflow-hidden border-b flex items-center justify-center p-1.5"
                          style={{
                            background: "#FFFFFF",
                            borderColor: c.borderSub,
                          }}
                          title="点击图片朗读"
                        >
                          <img
                            src={getCardImageUrl(item, cdnBaseUrl)}
                            alt={item.word}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-contain"
                          />
                        </div>
                      )}

                      <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
                        <div className="space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h3
                                className="text-[15px] font-semibold leading-snug break-words"
                                style={{ color: c.fg }}
                                lang="en"
                              >
                                {item.word}
                              </h3>
                              {item.pos && (
                                <span
                                  className="inline-block text-[11px] font-medium"
                                  style={{ color: c.accent }}
                                >
                                  {item.pos}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => speakVocabText(item.audioText || item.word, speed)}
                              className="p-1.5 rounded-lg transition-colors shrink-0 cursor-pointer"
                              style={{ background: c.inputBg, color: c.fgDim }}
                              title="朗读"
                            >
                              <SpeakerIcon size={13} />
                            </button>
                          </div>

                          <p className="text-[12.5px] leading-snug" style={{ color: c.fgSub }}>
                            {item.definition}
                          </p>

                          {item.entryType === "sentence" ? (
                            <div
                              className="pt-2 border-t space-y-1 text-[12px]"
                              style={{ borderColor: c.borderSub, color: c.fgDim }}
                              lang="en"
                            >
                              {dialogueLines(item).map((line, i) => (
                                <p key={i}>{line}</p>
                              ))}
                            </div>
                          ) : (
                            item.sentence && (
                              <div
                                className="pt-2 border-t flex items-start justify-between gap-1.5"
                                style={{ borderColor: c.borderSub }}
                              >
                                <p
                                  className="text-[11.5px] leading-relaxed"
                                  style={{ color: c.fgMuted }}
                                  lang="en"
                                >
                                  {item.sentence}
                                </p>
                                <button
                                  type="button"
                                  onClick={() =>
                                    speakVocabText(
                                      item.exampleAudio || item.sentence || item.word,
                                      speed,
                                    )
                                  }
                                  className="p-1 rounded-md opacity-70 hover:opacity-100 shrink-0 cursor-pointer"
                                  style={{ color: c.fgDim }}
                                  title="朗读例句"
                                >
                                  <SpeakerIcon size={12} />
                                </button>
                              </div>
                            )
                          )}
                        </div>

                        <div
                          className="pt-2 flex items-center justify-between border-t"
                          style={{ borderColor: c.borderSub }}
                        >
                          <button
                            type="button"
                            onClick={() => toggleBookmark(item.id)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11.5px] font-medium transition-colors cursor-pointer"
                            style={
                              isBookmarked
                                ? { background: c.warningDim, color: c.warning }
                                : { color: c.fgMuted }
                            }
                          >
                            <StarIcon filled={isBookmarked} />
                            <span>{isBookmarked ? "已收藏" : "收藏"}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => toggleMastered(item.id)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11.5px] font-medium transition-colors cursor-pointer"
                            style={
                              isMastered
                                ? { background: c.successDim, color: c.success }
                                : { color: c.fgMuted }
                            }
                          >
                            <CheckIcon />
                            <span>{isMastered ? "已掌握" : "掌握"}</span>
                          </button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* 3D Flashcard Modal */}
      <Modal
        c={c}
        open={flashcardOpen && Boolean(activeFlashcard)}
        onClose={() => setFlashcardOpen(false)}
        label="翻卡练习"
        maxWidthClassName="max-w-lg"
      >
        {activeFlashcard && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="type-secondary zen-tnum" style={{ color: c.fgMuted }}>
                {flashcardIndex + 1} / {flashcardList.length}
              </span>
              <div className="flex items-center gap-2">
                <Button c={c} variant="secondary" onClick={shuffleFlashcards}>
                  随机打乱
                </Button>
                <Button c={c} variant="ghost" onClick={() => setFlashcardOpen(false)}>
                  关闭
                </Button>
              </div>
            </div>

            <div
              onClick={() => setIsFlipped((f) => !f)}
              className="flashcard-perspective cursor-pointer select-none"
            >
              <div
                className={`flashcard-inner relative w-full min-h-[340px] transition-transform duration-500 ${
                  isFlipped ? "is-flipped" : ""
                }`}
              >
                <div
                  className="flashcard-face rounded-2xl border p-6 flex flex-col items-center justify-center text-center"
                  style={{ background: c.card, borderColor: c.border }}
                >
                  {activeFlashcard.entryType !== "sentence" && (
                    <img
                      src={getCardImageUrl(activeFlashcard, cdnBaseUrl)}
                      alt={activeFlashcard.word}
                      className="max-h-44 object-contain mb-4 rounded-xl"
                    />
                  )}
                  <h3 className="text-3xl font-bold" style={{ color: c.fg }} lang="en">
                    {activeFlashcard.word}
                  </h3>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      speakVocabText(activeFlashcard.audioText || activeFlashcard.word, speed);
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium cursor-pointer"
                    style={{ background: c.accentDim, color: c.accent }}
                  >
                    <SpeakerIcon size={14} />
                    <span>朗读</span>
                  </button>
                  <p className="type-caption mt-4" style={{ color: c.fgMuted }}>
                    点击卡片或按空格键翻面
                  </p>
                </div>

                <div
                  className="flashcard-face flashcard-back rounded-2xl border p-6 flex flex-col items-center justify-center text-center"
                  style={{ background: c.card, borderColor: c.border }}
                >
                  {activeFlashcard.pos && (
                    <span className="type-caption font-medium mb-2" style={{ color: c.accent }}>
                      {activeFlashcard.pos}
                    </span>
                  )}
                  <p className="text-xl font-semibold mb-4" style={{ color: c.fg }}>
                    {activeFlashcard.definition}
                  </p>
                  {activeFlashcard.sentence && (
                    <p
                      className="type-secondary p-3.5 rounded-xl w-full text-left"
                      style={{ background: c.inputBg, color: c.fgSub }}
                      lang="en"
                    >
                      {activeFlashcard.sentence}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Button
                c={c}
                variant="secondary"
                disabled={flashcardIndex === 0}
                onClick={() => {
                  setIsFlipped(false);
                  setFlashcardIndex((i) => Math.max(0, i - 1));
                }}
              >
                ← 上一张
              </Button>
              <Button
                c={c}
                variant={mastered.has(activeFlashcard.id) ? "primary" : "secondary"}
                onClick={() => toggleMastered(activeFlashcard.id)}
              >
                {mastered.has(activeFlashcard.id) ? "已掌握" : "标记掌握"}
              </Button>
              <Button
                c={c}
                variant="secondary"
                disabled={flashcardIndex >= flashcardList.length - 1}
                onClick={() => {
                  setIsFlipped(false);
                  setFlashcardIndex((i) => Math.min(flashcardList.length - 1, i + 1));
                }}
              >
                下一张 →
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* A4 Print Sheets */}
      <section className="print-only" aria-label="A4 vocabulary sheets">
        {printSheets.map((sheet, idx) => (
          <article key={idx} className="print-sheet">
            <header className="print-sheet-header">
              <span>{meta.title}</span>
              <span>
                {idx + 1} / {printSheets.length}
              </span>
            </header>
            <div className={mode === "sentence" ? "print-grid-sentence" : "print-grid-card"}>
              {sheet.map((item) => (
                <div key={item.id} className="print-cell">
                  {item.entryType !== "sentence" && (
                    <img
                      src={getCardImageUrl(item, cdnBaseUrl)}
                      alt={item.word}
                      className="print-cell-img"
                    />
                  )}
                  <strong className="print-cell-word">{item.word}</strong>
                  <span className="print-cell-def">{item.definition}</span>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
