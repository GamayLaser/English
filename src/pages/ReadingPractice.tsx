import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { VocabEntry } from "@shared/schemas";
import { EnglishButton, EnglishEmptyState } from "../components/english/EnglishUi";
import Card from "../components/ui/Card";
import { addUserChunk } from "../features/chunks/chunksStore";
import { loadAiSettings } from "../features/english/aiSettings";
import {
  loadLastNovelChapterId,
  loadNovelChapter,
  loadNovelIndex,
  saveLastNovelChapterId,
  type NovelChapterContent,
  type NovelIndex,
} from "../features/novel/novelStore";
import { startStreamingReadingAudio } from "../features/reading/elevenLabsTts";
import { placeVocabCard, VocabCardPopover } from "../components/english/VocabCardPopover";
import { loadVocabMatcher, tokenizeVocabMatches, type VocabMatcher } from "../features/vocab/vocabMatcher";
import {
  loadVocabProgress,
  saveVocabBookmarks,
  saveVocabMastered,
  speakVocabText,
} from "../features/vocab/vocabStore";
import { api } from "../lib/api";
import {
  buildAnnotatedSegments,
  createReadingParagraphs,
  loadReadingProgress,
  removeAnnotation,
  upsertAnnotation,
  type ReadingProgress,
} from "../features/reading/readingProgress";
import { getLineSelection } from "../features/reading/readingSelection";
import { evaluateReadingSummary, type ReadingSummaryEvaluation } from "../features/reading/summaryEvaluator";
import { quickTranslate } from "../features/translator/quickTranslate";
import type { ThemeColors } from "../types";

interface PendingSelection {
  lineId: string;
  text: string;
  startIndex: number;
  translation: string;
  x: number;
  y: number;
}

const FONT_SIZES = [
  { label: "小", size: 16, lineHeight: 1.72 },
  { label: "中", size: 18, lineHeight: 1.75 },
  { label: "大", size: 20, lineHeight: 1.82 },
] as const;

export default function ReadingPractice({ c }: { c: ThemeColors; workspaceUpdate?: unknown }) {
  const [novelIndex, setNovelIndex] = useState<NovelIndex | null>(null);
  const [novelChapterId, setNovelChapterId] = useState<string>(() => loadLastNovelChapterId() ?? "");
  const [chapter, setChapter] = useState<NovelChapterContent | null>(null);
  const [loading, setLoading] = useState(true);

  const [fontIdx, setFontIdx] = useState(1);
  const [immersive, setImmersive] = useState(false);
  const [openVolumes, setOpenVolumes] = useState<Set<string>>(() => new Set(["vol-1"]));
  const [mobileTocOpen, setMobileTocOpen] = useState(false);
  const [showStudyGuide, setShowStudyGuide] = useState(false);
  const [showRetell, setShowRetell] = useState(false);

  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [chunkSaved, setChunkSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const [vocabMatcher, setVocabMatcher] = useState<VocabMatcher | null>(null);
  const [cdnBaseUrl, setCdnBaseUrl] = useState("");
  const [showVocabHints, setShowVocabHints] = useState(true);
  const [activeVocabCard, setActiveVocabCard] = useState<{
    entry: VocabEntry;
    x: number;
    y: number;
    above: boolean;
    contextSentence: string;
  } | null>(null);
  const [vocabBookmarks, setVocabBookmarks] = useState<Set<string>>(() => loadVocabProgress().bookmarked);
  const [vocabMastered, setVocabMastered] = useState<Set<string>>(() => loadVocabProgress().mastered);

  const [summaryText, setSummaryText] = useState("");
  const [summaryResult, setSummaryResult] = useState<ReadingSummaryEvaluation | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [summaryMic, setSummaryMic] = useState(false);

  const [audioBusy, setAudioBusy] = useState(false);
  const [playingAudio, setPlayingAudio] = useState(false);
  const [audioMessage, setAudioMessage] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const audioStopRef = useRef<(() => void) | null>(null);
  const summaryMicRef = useRef<{ stop: () => void } | null>(null);
  const tocAsideRef = useRef<HTMLElement | null>(null);
  const mobileTocRef = useRef<HTMLElement | null>(null);
  const articleScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadVocabMatcher().then(setVocabMatcher).catch(() => {});
    api.health().then((h) => setCdnBaseUrl(h.cardsCdnUrl || "")).catch(() => {});
    loadNovelIndex()
      .then((idx) => {
        setNovelIndex(idx);
        const all = idx.volumes.flatMap((v) => v.chapters);
        if (!novelChapterId || !all.some((ch) => ch.id === novelChapterId)) {
          if (all[0]) setNovelChapterId(all[0].id);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const allChapters = useMemo(
    () => novelIndex?.volumes.flatMap((v) => v.chapters.map((ch) => ({ ...ch, volumeId: v.id, volumeName: v.name }))) ?? [],
    [novelIndex],
  );

  const currentIdx = Math.max(0, allChapters.findIndex((ch) => ch.id === novelChapterId));
  const activeMeta = allChapters[currentIdx] ?? null;

  useEffect(() => {
    if (!activeMeta) return;
    setOpenVolumes((prev) => {
      if (prev.has(activeMeta.volumeId)) return prev;
      const next = new Set(prev);
      next.add(activeMeta.volumeId);
      return next;
    });
  }, [activeMeta?.volumeId]);

  function scrollTocToCurrent(root: HTMLElement | null) {
    const el = root?.querySelector<HTMLElement>("[data-novel-current='true']");
    if (!root || !el) return;
    const rootRect = root.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    root.scrollTop += elRect.top - rootRect.top - root.clientHeight / 2 + elRect.height / 2;
  }

  useEffect(() => {
    if (immersive || !novelChapterId) return;
    const frame = requestAnimationFrame(() => scrollTocToCurrent(tocAsideRef.current));
    return () => cancelAnimationFrame(frame);
  }, [novelChapterId, immersive]);

  useEffect(() => {
    if (!mobileTocOpen) return;
    const frame = requestAnimationFrame(() => scrollTocToCurrent(mobileTocRef.current));
    return () => cancelAnimationFrame(frame);
  }, [mobileTocOpen, novelChapterId]);

  const progressKey = activeMeta ? `novel:${activeMeta.id}` : "";
  const [progress, setProgress] = useState<ReadingProgress>({ summary: "", annotations: [], lastOpenedAt: 0 });

  function stopAudio() {
    audioStopRef.current?.();
    audioStopRef.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    setPlayingAudio(false);
  }

  useEffect(() => {
    if (!activeMeta) return;
    let active = true;
    stopAudio();
    saveLastNovelChapterId(activeMeta.id);
    setProgress(loadReadingProgress(`novel:${activeMeta.id}`));
    setPending(null);
    setActiveVocabCard(null);
    setChunkSaved(false);
    setMessage("");
    setShowStudyGuide(false);
    setShowRetell(false);
    setSummaryText("");
    setSummaryResult(null);
    setSummaryError("");
    loadNovelChapter(activeMeta.file)
      .then((data) => {
        if (active) {
          setChapter(data);
          articleScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        }
      })
      .catch(() => { });
    return () => {
      active = false;
    };
  }, [activeMeta?.id]);

  useEffect(() => {
    document.documentElement.classList.toggle("novel-immersive", immersive);
    return () => document.documentElement.classList.remove("novel-immersive");
  }, [immersive]);

  useEffect(() => () => stopAudio(), []);

  const paragraphs = useMemo(() => createReadingParagraphs(chapter?.story ?? ""), [chapter?.story]);

  const chapterRenderedParagraphs = useMemo(() => {
    const seenIds = new Set<string>();
    const map = new Map<
      string,
      Array<{
        text: string;
        translation?: string;
        vocabTokens?: ReturnType<typeof tokenizeVocabMatches>;
      }>
    >();
    for (const paragraph of paragraphs) {
      const matchingLineIds = [paragraph.id, ...paragraph.legacyLineIds];
      const notes = progress.annotations.filter((note) => matchingLineIds.includes(note.lineId));
      const segments = buildAnnotatedSegments(paragraph.text, notes);
      map.set(
        paragraph.id,
        segments.map((seg) => ({
          ...seg,
          vocabTokens:
            !seg.translation && showVocabHints && vocabMatcher
              ? tokenizeVocabMatches(seg.text, vocabMatcher, {
                  seenIds,
                  excludedIds: vocabMastered,
                })
              : undefined,
        })),
      );
    }
    return map;
  }, [paragraphs, progress.annotations, showVocabHints, vocabMatcher, vocabMastered]);

  if (loading) {
    return <div className="py-20 text-center text-sm" style={{ color: c.fgMuted }}>正在打开小说目录…</div>;
  }

  if (!activeMeta || !chapter) {
    return <EnglishEmptyState c={c} title="未找到小说章节" description="请确认 public/novel-data 已生成。" />;
  }

  const activeVolume = novelIndex?.volumes.find((v) => v.id === activeMeta.volumeId) ?? novelIndex?.volumes[0];
  const fontStyle = FONT_SIZES[fontIdx];
  const chapterContent = chapter;

  function toggleVolume(volumeId: string) {
    setOpenVolumes((prev) => {
      const next = new Set(prev);
      if (next.has(volumeId)) next.delete(volumeId);
      else next.add(volumeId);
      return next;
    });
  }

  function renderToc(onSelect: () => void) {
    if (!novelIndex) return null;
    return (
      <nav aria-label="小说章节目录">
        <p className="px-1 pb-2 text-xs font-semibold tracking-[0.16em] uppercase" style={{ color: c.accent }}>
          目录
        </p>
        <div className="space-y-1">
          {novelIndex.volumes.map((volume) => {
            const open = openVolumes.has(volume.id);
            const containsCurrent = volume.id === activeMeta.volumeId;
            return (
              <div key={volume.id}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => toggleVolume(volume.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-semibold cursor-pointer"
                  style={{ color: containsCurrent ? c.accent : c.fg }}
                >
                  <span className="w-3 shrink-0 text-xs" style={{ color: c.fgMuted }}>{open ? "▾" : "▸"}</span>
                  <span className="min-w-0 flex-1 truncate">{volume.name}</span>
                  <span className="shrink-0 text-[11px] zen-tnum" style={{ color: c.fgMuted }}>{volume.chapters.length}</span>
                </button>
                {open && (
                  <ul className="ml-3 border-l py-1" style={{ borderColor: c.borderSub }}>
                    {volume.chapters.map((ch) => {
                      const isCurrent = ch.id === activeMeta.id;
                      return (
                        <li key={ch.id}>
                          <button
                            type="button"
                            data-novel-current={isCurrent ? "true" : undefined}
                            title={ch.title}
                            onClick={() => {
                              setNovelChapterId(ch.id);
                              onSelect();
                            }}
                            className="w-full truncate rounded-md px-2.5 py-1.5 text-left text-xs cursor-pointer"
                            style={{
                              color: isCurrent ? c.accent : c.fgSub,
                              background: isCurrent ? c.accentDim : "transparent",
                              fontWeight: isCurrent ? 600 : 400,
                            }}
                          >
                            {ch.title}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </nav>
    );
  }

  function renderParagraphList(list: typeof paragraphs) {
    return list.map((paragraph) => {
      const matchingLineIds = [paragraph.id, ...paragraph.legacyLineIds];
      const segments = chapterRenderedParagraphs.get(paragraph.id) ?? [];
      let sourceCursor = 0;

      return (
        <div
          key={paragraph.id}
          data-reading-line={paragraph.id}
          onMouseUp={(event) => {
            if (!(event.target instanceof HTMLElement && event.target.closest("button"))) {
              void captureSelection(paragraph.id, paragraph.text);
            }
          }}
          className="select-text"
        >
          <p
            style={{
              color: c.fg,
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: `${fontStyle.size}px`,
              lineHeight: fontStyle.lineHeight,
            }}
          >
            {segments.map((segment, index) => {
              const startIndex = paragraph.text.indexOf(segment.text, sourceCursor);
              sourceCursor = startIndex + segment.text.length;
              return segment.translation ? (
                <span
                  key={`${segment.text}-${index}`}
                  data-reading-segment
                  data-reading-start={startIndex}
                  className="relative mx-0.5 inline-block align-baseline leading-none"
                >
                  <span data-reading-original className="underline decoration-dotted underline-offset-4" style={{ textDecorationColor: c.accent }}>
                    {segment.text}
                  </span>
                  <span
                    className="group absolute left-1/2 top-[calc(100%+0.15rem)] inline-flex -translate-x-1/2 items-center whitespace-nowrap font-sans text-xs font-medium leading-none"
                    style={{ color: c.accent }}
                  >
                    <span>{segment.translation}</span>
                    <button
                      type="button"
                      onClick={() => removeNote(matchingLineIds, segment.text, startIndex)}
                      className="ml-1 grid size-3.5 place-items-center rounded-full text-[10px] opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                      style={{ background: c.card, border: `1px solid ${c.accent}`, color: c.accent }}
                      aria-label={`删除 ${segment.text} 的释义`}
                    >
                      ×
                    </button>
                  </span>
                </span>
              ) : (
                <span key={`${segment.text}-${index}`} data-reading-segment data-reading-start={startIndex}>
                  {segment.vocabTokens
                    ? segment.vocabTokens.map((tok, tokIdx) =>
                        tok.entry ? (
                          <span
                            key={`${tokIdx}-${tok.text}`}
                            className="novel-vocab-hit"
                            onClick={(e) => handleVocabHitClick(tok.entry!, e, paragraph.text)}
                          >
                            {tok.text}
                          </span>
                        ) : (
                          tok.text
                        ),
                      )
                    : segment.text}
                </span>
              );
            })}
          </p>
        </div>
      );
    });
  }

  function handleVocabHitClick(
    entry: VocabEntry,
    event: React.MouseEvent<HTMLSpanElement>,
    contextSentence: string,
  ) {
    const card = placeVocabCard(entry, event, contextSentence);
    if (!card) return;
    setPending(null);
    setActiveVocabCard(card);
    speakVocabText(entry.audioText || entry.word, 0.95);
  }

  function toggleVocabCardBookmark(entry: VocabEntry, contextSentence: string) {
    const next = new Set(vocabBookmarks);
    if (next.has(entry.id)) {
      next.delete(entry.id);
    } else {
      next.add(entry.id);
      addUserChunk({
        en: entry.word,
        zh: entry.definition,
        context: contextSentence.slice(0, 120),
        source: "novel",
        sourceRef: activeMeta?.id,
      });
    }
    setVocabBookmarks(next);
    saveVocabBookmarks(next);
  }

  function toggleVocabCardMastered(entryId: string) {
    const next = new Set(vocabMastered);
    if (next.has(entryId)) next.delete(entryId);
    else next.add(entryId);
    setVocabMastered(next);
    saveVocabMastered(next);
  }

  function stepChapter(delta: -1 | 1) {
    const next = allChapters[currentIdx + delta];
    if (next) setNovelChapterId(next.id);
  }

  async function captureSelection(lineId: string, sourceText: string) {
    const selection = window.getSelection();
    const selectedRangeText = selection?.toString() ?? "";
    const lineIdFor = (node: Node | null) => {
      const element = node instanceof Element ? node : node?.parentElement;
      return element?.closest<HTMLElement>("[data-reading-line]")?.dataset.readingLine ?? null;
    };
    const selectedText = getLineSelection(
      { text: selectedRangeText, anchorLineId: lineIdFor(selection?.anchorNode ?? null), focusLineId: lineIdFor(selection?.focusNode ?? null) },
      lineId,
    );
    if (!selectedText) {
      setPending(null);
      return;
    }
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const startIndex = selectionStartIndex(range, selectedRangeText, selectedText, sourceText);
    const rect = range?.getBoundingClientRect();
    const x = rect ? Math.min(window.innerWidth - 170, Math.max(170, rect.left + rect.width / 2)) : window.innerWidth / 2;
    const y = rect ? rect.bottom + 12 : 120;
    setPending({ lineId, text: selectedText, startIndex, translation: "", x, y });
    setChunkSaved(false);
    setMessage("");
    const settings = loadAiSettings();
    setBusy(true);
    try {
      const translation = await quickTranslate({ settings, text: selectedText, mode: "en2zh" });
      setPending((current) => (current?.lineId === lineId && current.text === selectedText ? { ...current, translation } : current));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "翻译失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  function addAnnotation() {
    if (!pending?.translation) return;
    setProgress(
      upsertAnnotation({
        articleId: progressKey,
        lineId: pending.lineId,
        selectedText: pending.text,
        startIndex: pending.startIndex,
        translation: pending.translation,
      }),
    );
    setPending(null);
    window.getSelection()?.removeAllRanges();
  }

  function saveSelectionAsChunk() {
    if (!pending?.translation || !chapter) return;
    addUserChunk({
      en: pending.text,
      zh: pending.translation,
      context: chapter.title,
      source: "novel",
    });
    setChunkSaved(true);
  }

  function removeNote(lineIds: string[], selectedText: string, startIndex: number) {
    const next = lineIds.reduce((current, lineId) => removeAnnotation(progressKey, lineId, selectedText, startIndex), progress);
    setProgress(next);
  }

  async function playChapter() {
    if (!chapter) return;
    if (playingAudio) {
      stopAudio();
      return;
    }
    stopAudio();
    setAudioBusy(true);
    setAudioMessage("");
    try {
      const session = await startStreamingReadingAudio({ text: chapter.story });
      const player = session.player;
      audioRef.current = player;
      audioUrlRef.current = session.url;
      audioStopRef.current = session.stop;
      player.onended = () => stopAudio();
      player.onerror = () => {
        stopAudio();
        setAudioMessage("音频暂时无法播放，请重试。");
      };
      setPlayingAudio(true);
    } catch (error) {
      setAudioMessage(error instanceof Error ? error.message : "朗读生成失败，请重试。");
    } finally {
      setAudioBusy(false);
    }
  }

  function toggleSummaryVoice() {
    if (summaryMic) {
      summaryMicRef.current?.stop();
      setSummaryMic(false);
      return;
    }
    const w = window as unknown as Record<string, unknown>;
    const Ctor = (w.SpeechRecognition || w.webkitSpeechRecognition) as (new () => {
      lang: string;
      interimResults: boolean;
      onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
      onerror: (() => void) | null;
      onend: (() => void) | null;
      start: () => void;
      stop: () => void;
    }) | undefined;
    if (!Ctor) {
      setSummaryError("当前浏览器不支持语音识别，请直接打字复述。");
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const text = e.results?.[0]?.[0]?.transcript?.trim();
      if (text) setSummaryText((prev) => (prev ? `${prev} ${text}` : text));
    };
    rec.onerror = () => setSummaryMic(false);
    rec.onend = () => setSummaryMic(false);
    summaryMicRef.current = rec;
    setSummaryMic(true);
    rec.start();
  }

  async function submitSummary() {
    if (!chapter || !summaryText.trim()) return;
    const settings = loadAiSettings();
    setSummaryBusy(true);
    setSummaryError("");
    try {
      setSummaryResult(
        await evaluateReadingSummary({
          settings,
          article: { id: progressKey, title: chapter.title, content: chapter.story, source: "built-in" },
          summary: summaryText,
        }),
      );
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : "复述评分失败，请重试。");
    } finally {
      setSummaryBusy(false);
    }
  }

  function chip(label: string, onClick: () => void, active = false, disabled = false) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="shrink-0 whitespace-nowrap min-h-8 rounded-lg px-2.5 text-xs font-medium cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
        style={active ? { background: c.accentDim, color: c.accent } : { background: c.inputBg, color: c.fgSub }}
      >
        {label}
      </button>
    );
  }

  function renderReadingTools(variant: "article" | "bar") {
    return (
      <>
        {variant === "bar" && chip("目录", () => setMobileTocOpen(true), mobileTocOpen)}
        {chip(showVocabHints ? "词卡波浪线 ✓" : "词卡波浪线", () => setShowVocabHints((v) => !v), showVocabHints)}
        {chip(`字号 ${fontStyle.label}`, () => setFontIdx((i) => (i + 1) % FONT_SIZES.length))}
        {chip(audioBusy ? "准备中…" : playingAudio ? "停止朗读" : "朗读本章", () => void playChapter(), playingAudio, audioBusy)}
        {variant === "bar" && chip("上一章", () => stepChapter(-1), false, currentIdx === 0)}
        {variant === "bar" && chip("下一章", () => stepChapter(1), false, currentIdx >= allChapters.length - 1)}
        {chip("沉浸模式", () => { setImmersive(true); setMobileTocOpen(false); })}
      </>
    );
  }

  function renderSidePanels() {
    return (
      <>
        {showStudyGuide && chapterContent.studyGuide && (
          <Card c={c}>
            <div className="p-4 whitespace-pre-line text-sm leading-relaxed" style={{ color: c.fgSub }}>
              {chapterContent.studyGuide}
            </div>
          </Card>
        )}
        {showRetell && (
          <Card c={c}>
            <div className="p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: c.fg }}>用 2~3 句英文复述本章</h3>
                  <p className="mt-1 text-xs" style={{ color: c.fgMuted }}>合上书自己讲一遍，AI 帮你改得更地道</p>
                </div>
                <EnglishButton variant={summaryMic ? "danger" : "secondary"} c={c} onClick={toggleSummaryVoice}>
                  {summaryMic ? "停止录音" : "语音复述"}
                </EnglishButton>
              </div>
              <textarea
                value={summaryText}
                onChange={(e) => setSummaryText(e.target.value)}
                rows={4}
                placeholder="用简单的英文说说这一章发生了什么…"
                className="w-full resize-y rounded-xl border px-3 py-2 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/35"
                style={{ background: c.inputBg, borderColor: c.inputBorder, color: c.fg }}
              />
              {summaryError && <p className="text-xs" style={{ color: c.danger }}>{summaryError}</p>}
              <div className="flex justify-end">
                <EnglishButton variant="primary" c={c} disabled={summaryBusy || !summaryText.trim()} onClick={() => void submitSummary()}>
                  {summaryBusy ? "正在点评…" : "提交点评"}
                </EnglishButton>
              </div>
              {summaryResult && (
                <div className="rounded-xl p-3 space-y-2" style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold" style={{ color: c.fg }}>复述点评</span>
                    <span className="type-title" style={{ color: c.accent }}>{summaryResult.score} 分</span>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: c.fgSub }}>{summaryResult.feedback}</p>
                  {summaryResult.modelSummary && (
                    <div className="mt-2 rounded-lg p-3 space-y-1.5" style={{ background: "var(--accent-soft)" }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold" style={{ color: c.accent }}>母语者复述示范</span>
                        <button
                          type="button"
                          onClick={() => speakVocabText(summaryResult.modelSummary!, 0.9)}
                          className="rounded px-2 py-0.5 text-xs font-medium cursor-pointer"
                          style={{ background: c.card, color: c.accent }}
                        >
                          朗读示范
                        </button>
                      </div>
                      <p className="text-sm leading-relaxed" style={{ color: c.fg }} lang="en">{summaryResult.modelSummary}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        )}
      </>
    );
  }

  return (
    <>
    <div className={`zen-page-enter -mx-4 -my-5 flex min-h-0 items-stretch justify-center gap-6 overflow-hidden px-4 md:-mx-7 md:-my-6 md:px-7 ${immersive ? "h-dvh py-8" : "h-[calc(100dvh-3.5rem)] pt-5 md:pt-6"}`}>
      {!immersive && (
        <aside
          ref={tocAsideRef}
          className="hidden min-h-0 w-[220px] shrink-0 self-stretch overflow-y-auto rounded-2xl p-3 zen-card xl:block"
          style={{ borderColor: c.borderSub }}
        >
          {renderToc(() => {})}
        </aside>
      )}

      <div
        className={`min-h-0 w-full max-w-3xl self-stretch ${immersive ? "pb-2" : "pb-20 xl:pb-2"}`}
      >
        <Card
          c={c}
          className="h-full flex flex-col overflow-hidden rounded-2xl zen-paper"
          style={{ boxShadow: "var(--shadow-book)" }}
        >
          <div ref={articleScrollRef} className="min-h-0 flex-1 overflow-y-auto">
            <article className="px-6 py-8 sm:px-12 sm:py-10">
              <header className={`text-center ${immersive ? "mb-8" : "border-b pb-5 mb-5 xl:mb-0 xl:border-b-0"}`} style={{ borderColor: c.borderSub }}>
                {!immersive && (
                  <p className="text-[11px] font-semibold tracking-[0.2em] uppercase" style={{ color: c.accent }}>
                    RIVER STREET · {activeVolume?.name}
                  </p>
                )}
                <h1
                  className="mt-2 text-2xl font-bold tracking-tight"
                  style={{ color: c.fg, fontFamily: 'Georgia, "Times New Roman", serif' }}
                >
                  {chapter.title}
                </h1>
                {!immersive && (
                  <p className="mt-1.5 text-xs zen-tnum" style={{ color: c.fgMuted }}>
                    约 {chapter.wordCount} 词 · {currentIdx + 1}/{allChapters.length}
                  </p>
                )}
              </header>
              {!immersive && (
                <div className="mt-4 mb-7 hidden flex-wrap items-center justify-center gap-1.5 border-b pb-5 xl:flex" style={{ borderColor: c.borderSub }}>
                  {renderReadingTools("article")}
                </div>
              )}
              <div className="space-y-3.5">{renderParagraphList(paragraphs)}</div>
              {audioMessage && <p className="mt-6 text-sm" style={{ color: c.danger }}>{audioMessage}</p>}
              {message && <p className="mt-4 text-sm" style={{ color: c.danger }}>{message}</p>}
              {!immersive && (
                <footer className="mt-10 flex items-center justify-between gap-3 border-t pt-6" style={{ borderColor: c.borderSub }}>
                  <EnglishButton variant="secondary" c={c} disabled={currentIdx === 0} onClick={() => stepChapter(-1)}>
                    ← 上一章
                  </EnglishButton>
                  <EnglishButton variant="primary" c={c} disabled={currentIdx >= allChapters.length - 1} onClick={() => stepChapter(1)}>
                    下一章 →
                  </EnglishButton>
                </footer>
              )}
              {!immersive && (
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  {chapterContent.studyGuide && (
                    <EnglishButton variant="ghost" c={c} onClick={() => setShowStudyGuide((v) => !v)}>
                      {showStudyGuide ? "收起重点讲解" : "重点讲解"}
                    </EnglishButton>
                  )}
                  <EnglishButton variant="ghost" c={c} onClick={() => setShowRetell((v) => !v)}>
                    {showRetell ? "收起复述" : "复述卡"}
                  </EnglishButton>
                </div>
              )}
            </article>
            {!immersive && (
              <div className="px-6 pb-8 sm:px-12 space-y-4">
                {renderSidePanels()}
              </div>
            )}
          </div>
        </Card>
      </div>
      </div>
      {immersive && (
        <button
          type="button"
          onClick={() => setImmersive(false)}
          className="fixed right-4 top-4 z-50 min-h-8 rounded-lg px-3 text-xs font-medium cursor-pointer zen-card"
          style={{ color: c.accent, background: c.card }}
        >
          退出沉浸
        </button>
      )}

      {/* Selection Popup (portaled to body so zen-page-enter transform never offsets fixed coords) */}
      {pending &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed z-[60] w-80 -translate-x-1/2 rounded-2xl p-4 zen-card zen-modal"
            style={{ left: pending.x, top: pending.y }}
          >
            <p className="text-xs" style={{ color: c.fgMuted }}>“{pending.text}”</p>
            <p className="mt-2 text-base font-semibold" style={{ color: c.fg }}>
              {busy ? "正在翻译…" : pending.translation || "暂未获得译文"}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <EnglishButton variant="primary" c={c} disabled={busy || !pending.translation} onClick={addAnnotation}>
                标注在文中
              </EnglishButton>
              <EnglishButton variant="secondary" c={c} disabled={busy || !pending.translation || chunkSaved} onClick={saveSelectionAsChunk}>
                {chunkSaved ? "已存语块 ✓" : "收藏语块"}
              </EnglishButton>
              <EnglishButton variant="ghost" c={c} onClick={() => setPending(null)}>
                关闭
              </EnglishButton>
            </div>
          </div>,
          document.body,
        )}

      <VocabCardPopover
        c={c}
        card={activeVocabCard}
        bookmarked={activeVocabCard ? vocabBookmarks.has(activeVocabCard.entry.id) : false}
        mastered={activeVocabCard ? vocabMastered.has(activeVocabCard.entry.id) : false}
        cdnBaseUrl={cdnBaseUrl}
        onClose={() => setActiveVocabCard(null)}
        onToggleBookmark={toggleVocabCardBookmark}
        onToggleMastered={toggleVocabCardMastered}
      />
      {!immersive && mobileTocOpen && typeof document !== "undefined" && createPortal(
        <div className="xl:hidden fixed inset-0 z-50">
          <button type="button" className="absolute inset-0 cursor-pointer" style={{ background: "rgba(0,0,0,0.45)" }} aria-label="关闭目录" onClick={() => setMobileTocOpen(false)} />
          <aside
            ref={mobileTocRef}
            className="absolute inset-y-0 left-0 w-[min(86vw,320px)] overflow-y-auto p-4"
            style={{ background: c.card, borderRight: `1px solid ${c.border}` }}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: c.fg }}>章节目录</span>
              <button type="button" className="rounded-lg px-2 py-1 text-xs cursor-pointer" style={{ color: c.fgMuted }} onClick={() => setMobileTocOpen(false)}>关闭</button>
            </div>
            {renderToc(() => setMobileTocOpen(false))}
          </aside>
        </div>,
        document.body,
      )}
      {!immersive && (
        <div
          className="xl:hidden fixed bottom-3 inset-x-3 z-40 flex items-center gap-1.5 overflow-x-auto rounded-2xl px-3 py-2.5 zen-card zen-glass"
          style={{ borderColor: c.border }}
        >
          {renderReadingTools("bar")}
        </div>
      )}
    </>
  );
}

function selectionStartIndex(range: Range | null, selectedRangeText: string, selectedText: string, sourceText: string) {
  if (range) {
    const element = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
    const segment = element?.closest<HTMLElement>("[data-reading-segment]");
    const segmentStart = Number(segment?.dataset.readingStart);
    if (Number.isInteger(segmentStart) && range.startContainer.nodeType === Node.TEXT_NODE) {
      const trimmedPrefixLength = Math.max(0, selectedRangeText.indexOf(selectedText));
      return segmentStart + range.startOffset + trimmedPrefixLength;
    }
  }
  return sourceText.toLocaleLowerCase().indexOf(selectedText.toLocaleLowerCase());
}
