import { useEffect, useMemo, useRef, useState } from "react";
import { EnglishButton, EnglishEmptyState, EnglishFilterTabs } from "../components/english/EnglishUi";
import { Modal } from "../components/ui";
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
import { speakVocabText } from "../features/vocab/vocabStore";
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
  const [spreadMode, setSpreadMode] = useState<"spread" | "single">("spread");
  const [tocOpen, setTocOpen] = useState(false);
  const [tocVolumeId, setTocVolumeId] = useState("vol-1");
  const [showStudyGuide, setShowStudyGuide] = useState(false);
  const [showRetell, setShowRetell] = useState(false);

  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [chunkSaved, setChunkSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

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

  useEffect(() => {
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
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      })
      .catch(() => { });
    return () => {
      active = false;
    };
  }, [activeMeta?.id]);

  useEffect(() => () => stopAudio(), []);

  const paragraphs = useMemo(() => createReadingParagraphs(chapter?.story ?? ""), [chapter?.story]);

  const [leftParagraphs, rightParagraphs] = useMemo(() => {
    if (paragraphs.length <= 1) return [paragraphs, []];
    const weights = paragraphs.map((p) => Math.max(40, p.text.length));
    const total = weights.reduce((a, b) => a + b, 0);
    const half = total / 2;
    let acc = 0;
    let splitIdx = 1;
    for (let i = 0; i < weights.length - 1; i++) {
      acc += weights[i];
      if (acc >= half) {
        splitIdx = i + 1;
        break;
      }
      splitIdx = i + 1;
    }
    return [paragraphs.slice(0, splitIdx), paragraphs.slice(splitIdx)];
  }, [paragraphs]);

  if (loading) {
    return <div className="py-20 text-center text-sm" style={{ color: c.fgMuted }}>正在打开小说目录…</div>;
  }

  if (!activeMeta || !chapter) {
    return <EnglishEmptyState c={c} title="未找到小说章节" description="请确认 public/novel-data 已生成。" />;
  }

  const activeVolume = novelIndex?.volumes.find((v) => v.id === activeMeta.volumeId) ?? novelIndex?.volumes[0];
  const fontStyle = FONT_SIZES[fontIdx];
  const isSpread = spreadMode === "spread" && rightParagraphs.length > 0;

  function renderParagraphList(list: typeof paragraphs) {
    return list.map((paragraph) => {
      const matchingLineIds = [paragraph.id, ...paragraph.legacyLineIds];
      const notes = progress.annotations.filter((note) => matchingLineIds.includes(note.lineId));
      const segments = buildAnnotatedSegments(paragraph.text, notes);
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
                  {segment.text}
                </span>
              );
            })}
          </p>
        </div>
      );
    });
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

  return (
    <div className={`space-y-5 pb-12 zen-page-enter ${isSpread ? "w-full" : "mx-auto max-w-3xl"}`}>
      {/* Slim Reader Top Bar */}
      <div
        className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl px-4 py-2.5 zen-card"
        style={{ borderColor: c.borderSub }}
      >
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <EnglishButton
            type="button"
            variant="secondary"
            c={c}
            onClick={() => {
              setTocVolumeId(activeVolume?.id ?? "vol-1");
              setTocOpen(true);
            }}
          >
            目录 · {activeVolume?.name.split(" · ")[0]} ({currentIdx + 1}/{allChapters.length})
          </EnglishButton>
          <span className="hidden sm:inline text-xs truncate max-w-[320px]" style={{ color: c.fgMuted }}>
            {chapter.title}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSpreadMode((m) => (m === "spread" ? "single" : "spread"))}
            className="hidden lg:inline-flex items-center min-h-8 rounded-lg px-2.5 text-xs font-medium cursor-pointer"
            style={{ background: c.inputBg, color: c.fgSub }}
            title="切换单页 / 宽屏双页"
          >
            {spreadMode === "spread" ? "双页" : "单页"}
          </button>
          <button
            type="button"
            onClick={() => setFontIdx((i) => (i + 1) % FONT_SIZES.length)}
            className="min-h-8 rounded-lg px-2.5 text-xs font-medium cursor-pointer"
            style={{ background: c.inputBg, color: c.fgSub }}
            title="切换字号"
          >
            字号 {fontStyle.label}
          </button>
          <EnglishButton
            type="button"
            variant="secondary"
            c={c}
            disabled={audioBusy}
            onClick={() => void playChapter()}
          >
            {audioBusy ? "准备中…" : playingAudio ? "停止朗读" : "朗读本章"}
          </EnglishButton>
        </div>
      </div>

      {/* Immersive Book Page */}
      <Card c={c} className="overflow-hidden zen-paper" style={{ boxShadow: "var(--shadow-book)" }}>
        <article className={isSpread ? "px-6 py-7 sm:px-10 sm:py-9 lg:px-14 lg:py-10" : "px-6 py-8 sm:px-12 sm:py-10"}>
          {isSpread ? (
            <div className="grid gap-8 lg:grid-cols-2 lg:gap-16 relative">
              {/* Warm Book Spine Gutter Shadow & Crease */}
              <div
                aria-hidden="true"
                className="hidden lg:block pointer-events-none absolute left-1/2 top-0 bottom-0 w-12 -translate-x-1/2"
                style={{
                  background: "linear-gradient(to right, transparent, rgba(120, 100, 75, 0.08), transparent)",
                }}
              />
              <div
                aria-hidden="true"
                className="hidden lg:block pointer-events-none absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2"
                style={{ background: "rgba(120, 100, 75, 0.16)" }}
              />

              {/* Left Page (Opening Chapter Header + First Half) */}
              <div className="flex flex-col justify-between min-w-0">
                <div>
                  <header className="mb-6">
                    <p className="text-[11px] font-semibold tracking-[0.18em] uppercase" style={{ color: c.accent }}>
                      RIVER STREET · {activeVolume?.name}
                    </p>
                    <h1
                      className="mt-1.5 text-2xl font-bold tracking-tight"
                      style={{ color: c.fg, fontFamily: 'Georgia, "Times New Roman", serif' }}
                    >
                      {chapter.title}
                    </h1>
                    <p className="mt-1 text-xs zen-tnum" style={{ color: c.fgMuted }}>
                      约 {chapter.wordCount} 词 · 划词查译并收藏进语块本
                    </p>
                  </header>
                  <div className="space-y-3.5">{renderParagraphList(leftParagraphs)}</div>
                </div>
                <p className="hidden lg:block text-center text-xs zen-tnum pt-7" style={{ color: c.fgDim, fontFamily: 'Georgia, "Times New Roman", serif' }}>
                  — {currentIdx * 2 + 1} —
                </p>
              </div>

              {/* Right Page */}
              <div className="flex flex-col justify-between min-w-0">
                <div>
                  <p className="hidden lg:block text-right text-[11px] tracking-[0.12em] mb-6 truncate" style={{ color: c.fgDim, fontFamily: 'Georgia, "Times New Roman", serif' }}>
                    {chapter.title}
                  </p>
                  <div className="space-y-3.5">{renderParagraphList(rightParagraphs)}</div>
                </div>
                <p className="hidden lg:block text-center text-xs zen-tnum pt-7" style={{ color: c.fgDim, fontFamily: 'Georgia, "Times New Roman", serif' }}>
                  — {currentIdx * 2 + 2} —
                </p>
              </div>
            </div>
          ) : (
            <div>
              <header className="text-center pb-6 mb-7 border-b" style={{ borderColor: c.borderSub }}>
                <p className="text-[11px] font-semibold tracking-[0.2em] uppercase" style={{ color: c.accent }}>
                  RIVER STREET · {activeVolume?.name}
                </p>
                <h1
                  className="mt-2 text-2xl font-bold tracking-tight"
                  style={{ color: c.fg, fontFamily: 'Georgia, "Times New Roman", serif' }}
                >
                  {chapter.title}
                </h1>
                <p className="mt-1.5 text-xs zen-tnum" style={{ color: c.fgMuted }}>
                  约 {chapter.wordCount} 词 · 划词可查释义并收藏进语块本
                </p>
              </header>
              <div className="space-y-3.5">{renderParagraphList(paragraphs)}</div>
            </div>
          )}

          {audioMessage && <p className="mt-6 text-sm" style={{ color: c.danger }}>{audioMessage}</p>}
          {message && <p className="mt-4 text-sm" style={{ color: c.danger }}>{message}</p>}

          {/* Chapter Bottom Bar */}
          <footer
            className="mt-10 pt-6 border-t flex flex-wrap items-center justify-between gap-3"
            style={{ borderColor: c.borderSub }}
          >
            <EnglishButton
              variant="secondary"
              c={c}
              disabled={currentIdx === 0}
              onClick={() => stepChapter(-1)}
            >
              ← 上一章
            </EnglishButton>

            <div className="flex flex-wrap items-center gap-2">
              {chapter.studyGuide && (
                <EnglishButton
                  variant="ghost"
                  c={c}
                  onClick={() => setShowStudyGuide((v) => !v)}
                >
                  {showStudyGuide ? "收起重点讲解" : "本章重点讲解"}
                </EnglishButton>
              )}
              <EnglishButton
                variant="ghost"
                c={c}
                onClick={() => setShowRetell((v) => !v)}
              >
                {showRetell ? "收起复述" : "口头复述打卡"}
              </EnglishButton>
            </div>

            <EnglishButton
              variant="primary"
              c={c}
              disabled={currentIdx >= allChapters.length - 1}
              onClick={() => stepChapter(1)}
            >
              下一章 →
            </EnglishButton>
          </footer>
        </article>
      </Card>

      {/* Optional Study Guide Drawer */}
      {showStudyGuide && chapter.studyGuide && (
        <Card c={c}>
          <div className="p-6 whitespace-pre-line text-sm leading-relaxed" style={{ color: c.fgSub }}>
            {chapter.studyGuide}
          </div>
        </Card>
      )}

      {/* Optional Oral Retell Card */}
      {showRetell && (
        <Card c={c}>
          <div className="p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold" style={{ color: c.fg }}>用 2~3 句英文复述本章</h3>
                <p className="mt-1 text-xs" style={{ color: c.fgMuted }}>合上书自己讲一遍，AI 帮你改得更地道</p>
              </div>
              <EnglishButton variant={summaryMic ? "danger" : "secondary"} c={c} onClick={toggleSummaryVoice}>
                {summaryMic ? "停止录音" : "语音复述"}
              </EnglishButton>
            </div>
            <textarea
              value={summaryText}
              onChange={(e) => setSummaryText(e.target.value)}
              rows={3}
              placeholder="用简单的英文说说这一章发生了什么…"
              className="w-full resize-y rounded-xl border px-4 py-3 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/35"
              style={{ background: c.inputBg, borderColor: c.inputBorder, color: c.fg }}
            />
            {summaryError && <p className="text-xs" style={{ color: c.danger }}>{summaryError}</p>}
            <div className="flex justify-end">
              <EnglishButton variant="primary" c={c} disabled={summaryBusy || !summaryText.trim()} onClick={() => void submitSummary()}>
                {summaryBusy ? "正在点评…" : "提交点评"}
              </EnglishButton>
            </div>
            {summaryResult && (
              <div className="rounded-xl p-4 space-y-2" style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}>
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

      {/* Selection Popup */}
      {pending && (
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
        </div>
      )}
      {/* Chapter Directory Modal */}
      <Modal c={c} open={tocOpen} onClose={() => setTocOpen(false)} label="小说章节目录" maxWidthClassName="max-w-2xl">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="type-caption font-semibold tracking-[0.14em] uppercase" style={{ color: c.accent }}>
                RIVER STREET · 497 CHAPTERS
              </p>
              <h3 className="type-title mt-0.5" style={{ color: c.fg }}>章节目录</h3>
            </div>
            <EnglishButton variant="ghost" c={c} onClick={() => setTocOpen(false)}>关闭</EnglishButton>
          </div>
          {novelIndex && (
            <>
              <EnglishFilterTabs
                tabs={novelIndex.volumes.map((v) => ({ id: v.id, label: `${v.name.split(" · ")[0]} (${v.chapters.length})` }))}
                value={tocVolumeId}
                onChange={setTocVolumeId}
                ariaLabel="选择小说卷"
                c={c}
              />
              <div className="max-h-[55vh] overflow-y-auto space-y-1.5 pr-1">
                {(novelIndex.volumes.find((v) => v.id === tocVolumeId)?.chapters ?? []).map((ch) => {
                  const isCurrent = ch.id === activeMeta.id;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => {
                        setNovelChapterId(ch.id);
                        setTocOpen(false);
                      }}
                      className="w-full flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm transition-colors cursor-pointer"
                      style={{
                        background: isCurrent ? c.accentDim : c.inputBg,
                        color: isCurrent ? c.accent : c.fg,
                        border: `1px solid ${isCurrent ? c.accent : c.borderSub}`,
                      }}
                    >
                      <span className="font-medium truncate">{ch.title}</span>
                      <span className="text-xs shrink-0 zen-tnum" style={{ color: isCurrent ? c.accent : c.fgMuted }}>
                        {isCurrent ? "正在阅读" : `${ch.wordCount} 词`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </Modal>
      {/* Mobile Floating Chapter Controls */}
      <div
        className="md:hidden fixed bottom-4 inset-x-4 z-40 flex items-center justify-between gap-2 rounded-2xl px-3.5 py-2.5 zen-card zen-glass"
        style={{ borderColor: c.border }}
      >
        <EnglishButton variant="ghost" c={c} disabled={currentIdx === 0} onClick={() => stepChapter(-1)}>
          ← 上一章
        </EnglishButton>
        <EnglishButton variant="secondary" c={c} disabled={audioBusy} onClick={() => void playChapter()}>
          {audioBusy ? "准备中…" : playingAudio ? "停止朗读" : "朗读"}
        </EnglishButton>
        <EnglishButton variant="primary" c={c} disabled={currentIdx >= allChapters.length - 1} onClick={() => stepChapter(1)}>
          下一章 →
        </EnglishButton>
      </div>
    </div>
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
