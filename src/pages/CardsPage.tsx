import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VocabCategoryMeta, VocabEntry } from "@shared/schemas";
import { Button, Card, EmptyState, FilterChip, Modal, SearchField } from "../components/ui";
import { addUserChunk } from "../features/chunks/chunksStore";
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
const PAGE_BATCH_SIZE = 48;

function SpeakerSvg({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

function BookmarkSvg({ filled }: { filled: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function MasteredSvg() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function HighlightedSentence({ sentence, word }: { sentence: string; word: string }) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escaped) return <>{sentence}</>;
  const regex = new RegExp(`(\\b${escaped}\\b)`, "gi");
  const parts = sentence.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>,
      )}
    </>
  );
}

const VocabCardItem = memo(function VocabCardItem({
  item,
  catName,
  showCategoryTag,
  cdnBaseUrl,
  speed,
  isBookmarked,
  isMastered,
  onToggleBookmark,
  onToggleMastered,
}: {
  item: VocabEntry;
  catName: string;
  showCategoryTag: boolean;
  cdnBaseUrl: string;
  speed: number;
  isBookmarked: boolean;
  isMastered: boolean;
  onToggleBookmark: (id: string) => void;
  onToggleMastered: (id: string) => void;
}) {
  return (
    <article className="vocab-card">
      <div className="vocab-card-header">
        {showCategoryTag ? (
          <span className="vocab-category-tag opacity-75" title={catName}>
            {catName}
          </span>
        ) : (
          <span />
        )}
        <div className="vocab-card-actions">
          <button
            type="button"
            className={`vocab-action-btn ${isBookmarked ? "bookmarked" : ""}`}
            onClick={() => onToggleBookmark(item.id)}
            title={isBookmarked ? "取消收藏" : "收藏卡片"}
            aria-label="收藏卡片"
          >
            <BookmarkSvg filled={isBookmarked} />
          </button>
          <button
            type="button"
            className={`vocab-action-btn ${isMastered ? "mastered" : ""}`}
            onClick={() => onToggleMastered(item.id)}
            title={isMastered ? "取消掌握" : "标记为已掌握"}
            aria-label="标记掌握"
          >
            <MasteredSvg />
          </button>
        </div>
      </div>

      {item.entryType !== "sentence" && (
        <div
          className="vocab-illustration-frame"
          onClick={() => speakVocabText(item.audioText || item.word, speed)}
          title="点击图片朗读"
        >
          <div className="vocab-img-wrapper">
            <img
              src={getCardImageUrl(item, cdnBaseUrl)}
              alt={item.word}
              loading="lazy"
              decoding="async"
              className="vocab-card-img"
            />
          </div>
        </div>
      )}

      <div className="vocab-card-body">
        <div className="vocab-word-row">
          <h3 className="vocab-word-text" lang="en">
            {item.word}
          </h3>
          <button
            type="button"
            className="vocab-audio-btn"
            onClick={() => speakVocabText(item.audioText || item.word, speed)}
            aria-label="朗读单词"
            title="朗读单词"
          >
            <SpeakerSvg size={16} />
          </button>
        </div>

        <div className="vocab-meaning-row">
          {item.pos && <span className="vocab-pos-tag">{item.pos}</span>}
          <span className="vocab-meaning-text">{item.definition}</span>
        </div>

        {item.sentence && (
          <div className="vocab-example-box">
            <div className="vocab-example-en" lang="en">
              <span>
                <HighlightedSentence sentence={item.sentence} word={item.word} />
              </span>
              <button
                type="button"
                className="vocab-sentence-audio-btn"
                onClick={() =>
                  speakVocabText(item.exampleAudio || item.sentence || item.word, speed)
                }
                title="朗读例句"
                aria-label="朗读例句"
              >
                <SpeakerSvg size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
});

const SentenceCardItem = memo(function SentenceCardItem({
  item,
  speed,
  isBookmarked,
  isMastered,
  onToggleBookmark,
  onToggleMastered,
}: {
  item: VocabEntry;
  speed: number;
  isBookmarked: boolean;
  isMastered: boolean;
  onToggleBookmark: (id: string) => void;
  onToggleMastered: (id: string) => void;
}) {
  return (
    <article className="sentence-card">
      <div className="sentence-headline">
        <h3 className="sentence-target" lang="en">
          {item.word}
        </h3>
        <div className="sentence-tools">
          <button
            type="button"
            className="vocab-audio-btn"
            onClick={() => speakVocabText(item.exampleAudio || item.sentence || item.word, speed)}
            aria-label="朗读句子"
            title="朗读句子"
          >
            <SpeakerSvg size={15} />
          </button>
          <button
            type="button"
            className={`vocab-action-btn ${isBookmarked ? "bookmarked" : ""}`}
            onClick={() => onToggleBookmark(item.id)}
            title="收藏"
          >
            <BookmarkSvg filled={isBookmarked} />
          </button>
          <button
            type="button"
            className={`vocab-action-btn ${isMastered ? "mastered" : ""}`}
            onClick={() => onToggleMastered(item.id)}
            title="标记掌握"
          >
            <MasteredSvg />
          </button>
        </div>
      </div>
      <p className="sentence-definition">{item.definition}</p>
      <div className="dialogue-box" lang="en">
        {dialogueLines(item).map((line, i) => {
          const match = line.match(/^([AB]):\s*(.*)$/);
          return (
            <p key={i} className="dialogue-line">
              {match && <span className="dialogue-speaker">{match[1]}</span>}
              <span className="dialogue-text">{match ? match[2] : line}</span>
            </p>
          );
        })}
      </div>
    </article>
  );
});

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
  const [visibleLimit, setVisibleLimit] = useState(PAGE_BATCH_SIZE);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const initial = useMemo(() => loadVocabProgress(), []);
  const [speed, setSpeed] = useState<number>(initial.speed);
  const [bookmarked, setBookmarked] = useState<Set<string>>(initial.bookmarked);
  const [mastered, setMastered] = useState<Set<string>>(initial.mastered);

  const [flashcardOpen, setFlashcardOpen] = useState(false);
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [shuffledOrder, setShuffledOrder] = useState<VocabEntry[] | null>(null);

  type QuizQuestion = { target: VocabEntry; options: VocabEntry[] };
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizSelectedId, setQuizSelectedId] = useState<string | null>(null);
  const [quizScore, setQuizScore] = useState(0);

  useEffect(() => {
    api.health().then((h) => setCdnBaseUrl(h.cardsCdnUrl || "")).catch(() => undefined);
    loadVocabIndex().then(setCategories).catch(() => undefined);
  }, []);

  useEffect(() => {
    setActiveFilter("all");
    setSearchQuery("");
    setSentenceTopic("");
    setVisibleLimit(PAGE_BATCH_SIZE);
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

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of categories) map.set(cat.id, cat.nameEn);
    return map;
  }, [categories]);

  const PRIORITY_CATEGORY_RE = /(verb|communication|everyday|scene|work|business|travel|idea|phrasal|social|meal|shopping)/i;

  const visibleCategories = useMemo(() => {
    return categories
      .filter((cat) => {
        if (mode === "sentence" && cat.group !== "sentence") return false;
        if (mode !== "sentence" && cat.group === "sentence") return false;
        return true;
      })
      .sort((a, b) => {
        const aPrio = PRIORITY_CATEGORY_RE.test(a.id) || PRIORITY_CATEGORY_RE.test(a.nameEn) ? 0 : 1;
        const bPrio = PRIORITY_CATEGORY_RE.test(b.id) || PRIORITY_CATEGORY_RE.test(b.nameEn) ? 0 : 1;
        return aPrio - bPrio;
      });
  }, [categories, mode]);

  const sentenceTopics = useMemo(() => {
    const set = new Set<string>();
    for (const item of entries) {
      if (item.entryType === "sentence" && item.topic) set.add(item.topic);
    }
    return [...set];
  }, [entries]);

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

  useEffect(() => {
    setVisibleLimit(PAGE_BATCH_SIZE);
  }, [mode, currentCategory, activeFilter, searchQuery, sentenceTopic]);

  const visibleCards = useMemo(
    () => filteredCards.slice(0, visibleLimit),
    [filteredCards, visibleLimit],
  );

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || visibleLimit >= filteredCards.length) return;
    const observer = new IntersectionObserver(
      (obs) => {
        if (obs[0]?.isIntersecting) {
          setVisibleLimit((prev) => Math.min(filteredCards.length, prev + PAGE_BATCH_SIZE));
        }
      },
      { rootMargin: "320px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visibleLimit, filteredCards.length]);

  const sentenceGroups = useMemo(() => {
    if (mode !== "sentence") return [];
    const groups = new Map<string, VocabEntry[]>();
    for (const item of visibleCards) {
      const topic = item.topic || "Sentences";
      const arr = groups.get(topic) ?? [];
      arr.push(item);
      groups.set(topic, arr);
    }
    return [...groups.entries()];
  }, [mode, visibleCards]);

  const toggleBookmark = useCallback((id: string) => {
    setBookmarked((prev) => {
      const next = new Set(prev);
      const adding = !next.has(id);
      if (adding) next.add(id);
      else next.delete(id);
      saveVocabBookmarks(next);
      if (adding) {
        const found = entries.find((e) => e.id === id);
        if (found) {
          addUserChunk({
            en: found.word,
            zh: found.definition,
            context: found.sentence || undefined,
            source: "card",
          });
        }
      }
      return next;
    });
  }, [entries]);

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

  const startAudioQuiz = () => {
    if (filteredCards.length < 4) return;
    const pool = [...filteredCards];
    const unmasteredFirst = [
      ...pool.filter((item) => !mastered.has(item.id)).sort(() => Math.random() - 0.5),
      ...pool.filter((item) => mastered.has(item.id)).sort(() => Math.random() - 0.5),
    ].slice(0, 10);

    const built: QuizQuestion[] = unmasteredFirst.map((target) => {
      const distractors = pool
        .filter((item) => item.id !== target.id)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);
      const options = [target, ...distractors].sort(() => Math.random() - 0.5);
      return { target, options };
    });

    setQuizQuestions(built);
    setQuizIndex(0);
    setQuizSelectedId(null);
    setQuizScore(0);
    setQuizOpen(true);
    if (built[0]) {
      speakVocabText(built[0].target.audioText || built[0].target.word, speed);
    }
  };

  const activeQuiz = quizQuestions[quizIndex] ?? null;
  const quizFinished = quizOpen && quizQuestions.length > 0 && quizIndex >= quizQuestions.length;

  const printSheets = useMemo(() => {
    const sheets: VocabEntry[][] = [];
    const perSheet = mode === "sentence" ? 8 : 16;
    for (let i = 0; i < filteredCards.length; i += perSheet) {
      sheets.push(filteredCards.slice(i, i + perSheet));
    }
    return sheets;
  }, [filteredCards, mode]);

  return (
    <div className="space-y-5 pb-8 zen-page-enter">
      <div className="no-print space-y-5">
        {/* Top Hero & Controls */}
        <Card c={c} wash={c.accentDim}>
          <div className="p-5 md:p-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="type-caption font-semibold tracking-[0.14em] uppercase" style={{ color: c.accent }}>
                  {meta.eyebrow}
                </p>
                <h2 className="type-page mt-1" style={{ color: c.fg }}>
                  {meta.title}
                </h2>
                <p className="type-secondary mt-1" style={{ color: c.fgMuted }}>
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
                  variant="secondary"
                  onClick={startAudioQuiz}
                  disabled={filteredCards.length < 4}
                >
                  听音辨词
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

        {/* Status Filter & Count Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-0.5">
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

        {/* Cards Viewport */}
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
        ) : mode === "sentence" ? (
          <div className="sentence-groups">
            {sentenceGroups.map(([topic, items]) => (
              <section key={topic}>
                <h3 className="sentence-group-title">
                  {topic}
                  <span>{items.length}</span>
                </h3>
                <div className="sentence-list">
                  {items.map((item) => (
                    <SentenceCardItem
                      key={item.id}
                      item={item}
                      speed={speed}
                      isBookmarked={bookmarked.has(item.id)}
                      isMastered={mastered.has(item.id)}
                      onToggleBookmark={toggleBookmark}
                      onToggleMastered={toggleMastered}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="vocab-cards-grid">
            {visibleCards.map((item) => (
              <VocabCardItem
                key={item.id}
                item={item}
                catName={item.topic || categoryNameById.get(item.category) || ""}
                showCategoryTag={currentCategory === "all"}
                cdnBaseUrl={cdnBaseUrl}
                speed={speed}
                isBookmarked={bookmarked.has(item.id)}
                isMastered={mastered.has(item.id)}
                onToggleBookmark={toggleBookmark}
                onToggleMastered={toggleMastered}
              />
            ))}
          </div>
        )}

        {visibleLimit < filteredCards.length && (
          <div ref={loadMoreRef} className="py-6 text-center">
            <Button
              c={c}
              variant="secondary"
              onClick={() =>
                setVisibleLimit((prev) => Math.min(filteredCards.length, prev + PAGE_BATCH_SIZE))
              }
            >
              加载更多 ({visibleCards.length} / {filteredCards.length})
            </Button>
          </div>
        )}
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
                    <SpeakerSvg size={14} />
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

      {/* Audio Quiz Modal */}
      <Modal
        c={c}
        open={quizOpen}
        onClose={() => setQuizOpen(false)}
        label="听音辨词闯关"
        maxWidthClassName="max-w-lg"
      >
        {quizFinished ? (
          <div className="space-y-5 text-center py-4">
            <p className="type-caption font-semibold tracking-[0.14em] uppercase" style={{ color: c.accent }}>
              QUIZ COMPLETE
            </p>
            <h3 className="type-display" style={{ color: c.fg }}>
              {quizScore} / {quizQuestions.length} 题正确
            </h3>
            <p className="type-secondary" style={{ color: c.fgMuted }}>
              {quizScore >= Math.ceil(quizQuestions.length * 0.8)
                ? "听音反应很敏捷！可以继续挑战下一组或进入情景句子。"
                : "多听几遍慢速发音，耳朵会越来越熟悉这些高频表达。"}
            </p>
            <div className="flex justify-center gap-3 pt-2">
              <Button c={c} variant="secondary" onClick={() => setQuizOpen(false)}>
                返回词卡
              </Button>
              <Button c={c} variant="primary" onClick={startAudioQuiz}>
                再来一轮
              </Button>
            </div>
          </div>
        ) : activeQuiz ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <span className="type-secondary zen-tnum" style={{ color: c.fgMuted }}>
                第 {quizIndex + 1} / {quizQuestions.length} 题
              </span>
              <Button c={c} variant="ghost" onClick={() => setQuizOpen(false)}>
                退出
              </Button>
            </div>

            <div
              className="rounded-2xl p-6 text-center space-y-3"
              style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}
            >
              <p className="text-xs font-medium" style={{ color: c.fgMuted }}>
                听发音，选出正确的中文释义
              </p>
              <button
                type="button"
                onClick={() =>
                  speakVocabText(activeQuiz.target.audioText || activeQuiz.target.word, speed)
                }
                className="mx-auto inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-transform hover:scale-105 cursor-pointer"
                style={{ background: c.accent, color: c.accentFg }}
              >
                <SpeakerSvg size={16} />
                <span>重听发音 ({speed.toFixed(1)}x)</span>
              </button>
              {quizSelectedId && (
                <p className="text-lg font-bold pt-1" style={{ color: c.fg }} lang="en">
                  {activeQuiz.target.word}
                </p>
              )}
            </div>

            <div className="grid gap-2.5">
              {activeQuiz.options.map((opt) => {
                const answered = quizSelectedId !== null;
                const isCorrect = opt.id === activeQuiz.target.id;
                const isChosen = opt.id === quizSelectedId;
                let bg = c.card;
                let border = c.border;
                let color = c.fg;
                if (answered) {
                  if (isCorrect) {
                    bg = c.successDim;
                    border = c.success;
                    color = c.success;
                  } else if (isChosen) {
                    bg = c.dangerDim;
                    border = c.danger;
                    color = c.danger;
                  }
                }
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={answered}
                    onClick={() => {
                      setQuizSelectedId(opt.id);
                      if (opt.id === activeQuiz.target.id) {
                        setQuizScore((s) => s + 1);
                      }
                    }}
                    className="flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition-all cursor-pointer disabled:cursor-default"
                    style={{ background: bg, border: `1px solid ${border}`, color }}
                  >
                    <span>{opt.definition}</span>
                    {answered && (
                      <span className="text-xs font-semibold shrink-0" lang="en">
                        {opt.word}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {quizSelectedId && (
              <div className="flex items-center justify-between pt-1">
                <Button
                  c={c}
                  variant={mastered.has(activeQuiz.target.id) ? "secondary" : "ghost"}
                  onClick={() => toggleMastered(activeQuiz.target.id)}
                >
                  {mastered.has(activeQuiz.target.id) ? "已掌握" : "标记掌握"}
                </Button>
                <Button
                  c={c}
                  variant="primary"
                  onClick={() => {
                    const nextIdx = quizIndex + 1;
                    setQuizIndex(nextIdx);
                    setQuizSelectedId(null);
                    if (quizQuestions[nextIdx]) {
                      speakVocabText(
                        quizQuestions[nextIdx].target.audioText || quizQuestions[nextIdx].target.word,
                        speed,
                      );
                    }
                  }}
                >
                  {quizIndex + 1 >= quizQuestions.length ? "查看成绩" : "下一题 →"}
                </Button>
              </div>
            )}
          </div>
        ) : null}
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
