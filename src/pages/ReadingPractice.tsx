import { useEffect, useMemo, useRef, useState } from "react";
import { loadAiSettings } from "../features/english/aiSettings";
import { addUserChunk } from "../features/chunks/chunksStore";
import {
  loadLastNovelChapterId,
  loadNovelChapter,
  loadNovelIndex,
  saveLastNovelChapterId,
  type NovelChapterContent,
  type NovelIndex,
} from "../features/novel/novelStore";
import { startStreamingReadingAudio } from "../features/reading/elevenLabsTts";
import { loadReadingLibrary } from "../features/reading/readingLibrary";
import { createReadingQuiz, evaluateReadingQuiz, type ReadingQuiz, type ReadingQuizResult } from "../features/reading/readingQuiz";
import {
  buildAnnotatedSegments,
  completeReadingGroup,
  createReadingParagraphs,
  loadLastReadingArticle,
  loadReadingProgress,
  removeAnnotation,
  saveLastReadingArticle,
  upsertAnnotation,
  type ReadingProgress,
} from "../features/reading/readingProgress";
import { getLineSelection } from "../features/reading/readingSelection";
import { quickTranslate } from "../features/translator/quickTranslate";
import { evaluateReadingSummary, type ReadingSummaryEvaluation } from "../features/reading/summaryEvaluator";
import { EnglishButton, EnglishEmptyState, EnglishFilterTabs, EnglishPageHeader } from "../components/english/EnglishUi";
import type { ThemeColors } from "../types";
import Card from "../components/ui/Card";
import type { WorkspaceUpdate } from "../features/persistence/workspaceUpdateRouting";

interface PendingSelection {
  lineId: string;
  text: string;
  startIndex: number;
  translation: string;
  x: number;
  y: number;
}

export default function ReadingPractice({ c, workspaceUpdate = null }: { c: ThemeColors; workspaceUpdate?: WorkspaceUpdate | null }) {
  const [sourceMode, setSourceMode] = useState<"novel" | "articles">("novel");
  const [novelIndex, setNovelIndex] = useState<NovelIndex | null>(null);
  const [novelChapterId, setNovelChapterId] = useState<string>(() => loadLastNovelChapterId() ?? "");
  const [novelChapter, setNovelChapter] = useState<NovelChapterContent | null>(null);
  const [showStudyGuide, setShowStudyGuide] = useState(false);

  const [articles, setArticles] = useState(loadReadingLibrary);
  const [articleId, setArticleId] = useState(() => loadLastReadingArticle() ?? articles[0]?.id ?? "");
  const customArticle = articles.find((item) => item.id === articleId) ?? articles[0];

  useEffect(() => {
    loadNovelIndex()
      .then((idx) => {
        setNovelIndex(idx);
        const allChapters = idx.volumes.flatMap((v) => v.chapters);
        if (!novelChapterId || !allChapters.some((ch) => ch.id === novelChapterId)) {
          const first = allChapters[0]?.id ?? "";
          if (first) setNovelChapterId(first);
        }
      })
      .catch(() => {
        setSourceMode("articles");
      });
  }, []);

  const allNovelChapters = useMemo(
    () => novelIndex?.volumes.flatMap((v) => v.chapters.map((ch) => ({ ...ch, volumeId: v.id, volumeName: v.name }))) ?? [],
    [novelIndex],
  );

  const activeNovelMeta = allNovelChapters.find((ch) => ch.id === novelChapterId) ?? allNovelChapters[0] ?? null;

  useEffect(() => {
    if (!activeNovelMeta) return;
    let active = true;
    saveLastNovelChapterId(activeNovelMeta.id);
    loadNovelChapter(activeNovelMeta.file)
      .then((data) => {
        if (active) setNovelChapter(data);
      })
      .catch(() => { });
    return () => {
      active = false;
    };
  }, [activeNovelMeta?.id]);

  const article = useMemo(() => {
    if (sourceMode === "novel" && novelChapter) {
      return {
        id: `novel:${novelChapter.id}`,
        title: novelChapter.title,
        content: novelChapter.story,
        source: "built-in" as const,
      };
    }
    return customArticle;
  }, [sourceMode, novelChapter, customArticle]);

  const paragraphs = useMemo(() => createReadingParagraphs(article?.content ?? ""), [article?.content]);
  const [progress, setProgress] = useState<ReadingProgress>(() => article ? loadReadingProgress(article.id) : { summary: "", annotations: [], lastOpenedAt: 0 });
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [chunkSaved, setChunkSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [quiz, setQuiz] = useState<ReadingQuiz | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [quizResult, setQuizResult] = useState<ReadingQuizResult | null>(null);
  const [quizBusy, setQuizBusy] = useState(false);
  const [quizMessage, setQuizMessage] = useState("");
  const [summaryText, setSummaryText] = useState("");
  const [summaryResult, setSummaryResult] = useState<ReadingSummaryEvaluation | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [summaryMic, setSummaryMic] = useState(false);
  const summaryMicRef = useRef<{ stop: () => void } | null>(null);
  const [audioBusyId, setAudioBusyId] = useState<string | null>(null);
  const [playingParagraphId, setPlayingParagraphId] = useState<string | null>(null);
  const [audioMessage, setAudioMessage] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const audioStopRef = useRef<(() => void) | null>(null);
  const lastWorkspaceRevision = useRef(0);

  useEffect(() => {
    if (!workspaceUpdate || lastWorkspaceRevision.current === workspaceUpdate.revision) return;
    lastWorkspaceRevision.current = workspaceUpdate.revision;
    if (workspaceUpdate.keys.includes("english:reading-library-v2")) setArticles(loadReadingLibrary());
    if (article && workspaceUpdate.keys.includes("english:reading-progress-v2")) setProgress(loadReadingProgress(article.id));
  }, [workspaceUpdate?.revision, article?.id]);

  function stopAudio() {
    audioStopRef.current?.();
    audioStopRef.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    setPlayingParagraphId(null);
  }

  useEffect(() => {
    if (!article) return;
    stopAudio();
    if (sourceMode === "articles") saveLastReadingArticle(article.id);
    setProgress(loadReadingProgress(article.id));
    setPending(null);
    setChunkSaved(false);
    setMessage("");
    setQuiz(null); setQuizAnswers({}); setQuizResult(null); setQuizMessage("");
    setSummaryText(""); setSummaryResult(null); setSummaryError("");
  }, [article?.id, sourceMode]);

  useEffect(() => () => {
    audioRef.current?.pause();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
  }, []);

  if (!article) return <EnglishEmptyState c={c} title="还没有阅读文章" description="前往内容库导入一篇文章后，即可开始阅读练习。" />;

  async function captureSelection(lineId: string, sourceText: string) {
    const selection = window.getSelection();
    const selectedRangeText = selection?.toString() ?? "";
    const lineIdFor = (node: Node | null) => {
      const element = node instanceof Element ? node : node?.parentElement;
      return element?.closest<HTMLElement>("[data-reading-line]")?.dataset.readingLine ?? null;
    };
    const selectedText = getLineSelection({ text: selectedRangeText, anchorLineId: lineIdFor(selection?.anchorNode ?? null), focusLineId: lineIdFor(selection?.focusNode ?? null) }, lineId);
    if (!selectedText) { setPending(null); return; }
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const startIndex = selectionStartIndex(range, selectedRangeText, selectedText, sourceText);
    const rect = range?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const y = rect ? rect.bottom + 12 : 120;
    setPending({ lineId, text: selectedText, startIndex, translation: "", x, y });
    setChunkSaved(false);
    setMessage("");
    const settings = loadAiSettings();
    if (!settings) { setMessage("请先在设置中保存 DeepSeek API Key。"); return; }
    setBusy(true);
    try {
      const translation = await quickTranslate({ settings, text: selectedText, mode: "en2zh" });
      setPending((current) => current?.lineId === lineId && current.text === selectedText ? { ...current, translation } : current);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "翻译失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  function addAnnotation() {
    if (!pending?.translation || !article) return;
    setProgress(upsertAnnotation({ articleId: article.id, lineId: pending.lineId, selectedText: pending.text, startIndex: pending.startIndex, translation: pending.translation }));
    setPending(null);
    window.getSelection()?.removeAllRanges();
  }

  function saveSelectionAsChunk() {
    if (!pending?.translation || !article) return;
    addUserChunk({
      en: pending.text,
      zh: pending.translation,
      context: article.title,
      source: sourceMode === "novel" ? "novel" : "reading",
    });
    setChunkSaved(true);
  }

  function removeNote(lineIds: string[], selectedText: string, startIndex: number) {
    if (!article) return;
    const next = lineIds.reduce((current, lineId) => removeAnnotation(article.id, lineId, selectedText, startIndex), progress);
    setProgress(next);
  }

  function stepNovelChapter(delta: -1 | 1) {
    if (!activeNovelMeta) return;
    const idx = allNovelChapters.findIndex((ch) => ch.id === activeNovelMeta.id);
    const target = allNovelChapters[idx + delta];
    if (target) setNovelChapterId(target.id);
  }

  function completeGroup() {
    if (!article) return;
    if (sourceMode === "novel") {
      stepNovelChapter(1);
      return;
    }
    try {
      const { nextArticleId } = completeReadingGroup({ articles, article, progress, completedAt: Date.now() });
      if (nextArticleId) setArticleId(nextArticleId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "本组记录保存失败，请重试。");
    }
  }

  async function generateQuiz() {
    const settings = loadAiSettings();
    if (!settings) { setQuizMessage("请先在设置中保存 DeepSeek API Key。"); return; }
    setQuizBusy(true); setQuizMessage("");
    try {
      setQuiz(await createReadingQuiz({ settings, article }));
      setQuizAnswers({}); setQuizResult(null);
    } catch (error) {
      setQuizMessage(error instanceof Error ? error.message : "出题失败，请重试。");
    } finally {
      setQuizBusy(false);
    }
  }

  async function submitQuiz() {
    if (!quiz) return;
    if (quiz.questions.some((question) => !quizAnswers[question.id]?.trim())) { setQuizMessage("请先完成所有题目。 "); return; }
    const settings = loadAiSettings();
    if (!settings) { setQuizMessage("请先在设置中保存 DeepSeek API Key。"); return; }
    setQuizBusy(true); setQuizMessage("");
    try { setQuizResult(await evaluateReadingQuiz({ settings, quiz, answers: quizAnswers })); }
    catch (error) { setQuizMessage(error instanceof Error ? error.message : "判卷失败，请重试。"); }
    finally { setQuizBusy(false); }
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
    if (!article || !summaryText.trim()) {
      setSummaryError("请先用英文说出或写下 1~3 句大意。");
      return;
    }
    const settings = loadAiSettings();
    setSummaryBusy(true);
    setSummaryError("");
    try {
      setSummaryResult(await evaluateReadingSummary({ settings, article, summary: summaryText }));
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : "复述评分失败，请重试。");
    } finally {
      setSummaryBusy(false);
    }
  }

  async function playArticle() {
    const audioId = "full-article";
    if (playingParagraphId === audioId) {
      stopAudio();
      return;
    }
    stopAudio();
    setAudioBusyId(audioId);
    setAudioMessage("");
    try {
      const session = await startStreamingReadingAudio({ text: article.content });
      const player = session.player;
      audioRef.current = player;
      audioUrlRef.current = session.url;
      audioStopRef.current = session.stop;
      player.onended = () => {
        if (audioRef.current !== player) return;
        URL.revokeObjectURL(session.url);
        audioRef.current = null;
        audioUrlRef.current = null;
        audioStopRef.current = null;
        setPlayingParagraphId(null);
      };
      player.onerror = () => {
        if (audioRef.current !== player) return;
        session.stop();
        audioRef.current = null;
        audioUrlRef.current = null;
        audioStopRef.current = null;
        setAudioMessage("音频暂时无法播放，请重试。");
        setPlayingParagraphId(null);
      };
      void session.finished.catch((error: unknown) => {
        if (audioRef.current !== player) return;
        setAudioMessage(error instanceof Error ? error.message : "音频传输中断，请重试。");
      });
      setPlayingParagraphId(audioId);
    } catch (error) {
      setAudioMessage(error instanceof Error ? error.message : "朗读生成失败，请重试。");
    } finally {
      setAudioBusyId(null);
    }
  }

  if (!article) return <EnglishEmptyState c={c} title="正在准备阅读内容" description="请稍候，或切换到自定义文章导入一篇新文章。" />;

  const activeVolume = novelIndex?.volumes.find((v) => v.id === activeNovelMeta?.volumeId) ?? novelIndex?.volumes[0];

  return <div className="flex w-full flex-col gap-5 pb-8 zen-page-enter">
    <EnglishPageHeader
      c={c}
      eyebrow={sourceMode === "novel" ? "GRADED NOVEL · RIVER STREET" : "READING PRACTICE"}
      title={article.title}
      description="划词即时翻译、添加行间释义或收藏进个人语块本，支持全文朗读与 AI 阅读理解。"
      aside={
        <>
          {sourceMode === "novel" && novelIndex ? (
            <>
              <select
                value={activeVolume?.id ?? ""}
                onChange={(e) => {
                  const vol = novelIndex.volumes.find((v) => v.id === e.target.value);
                  if (vol?.chapters[0]) setNovelChapterId(vol.chapters[0].id);
                }}
                className="min-h-9 rounded-xl border px-3 py-1.5 text-[13px] font-medium outline-none"
                style={{ background: c.inputBg, borderColor: c.inputBorder, color: c.fg }}
                aria-label="选择小说卷"
              >
                {novelIndex.volumes.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.chapters.length}章)
                  </option>
                ))}
              </select>
              <select
                value={activeNovelMeta?.id ?? ""}
                onChange={(e) => setNovelChapterId(e.target.value)}
                className="min-h-9 rounded-xl border px-3 py-1.5 text-[13px] font-medium outline-none max-w-[220px]"
                style={{ background: c.inputBg, borderColor: c.inputBorder, color: c.fg }}
                aria-label="选择小说章节"
              >
                {(activeVolume?.chapters ?? []).map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.title} ({ch.wordCount}词)
                  </option>
                ))}
              </select>
            </>
          ) : (
            articles.length > 1 && (
              <select
                value={article.id}
                onChange={(e) => setArticleId(e.target.value)}
                className="min-h-9 rounded-xl border px-3 py-1.5 text-[13px] font-medium outline-none max-w-[220px]"
                style={{ background: c.inputBg, borderColor: c.inputBorder, color: c.fg }}
                aria-label="选择阅读文章"
              >
                {articles.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            )
          )}
          <EnglishButton type="button" variant="secondary" c={c} disabled={audioBusyId === "full-article"} onClick={() => void playArticle()}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {playingParagraphId === "full-article" ? (
                <rect x="6" y="6" width="12" height="12" rx="2" />
              ) : (
                <>
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </>
              )}
            </svg>
            {audioBusyId === "full-article" ? "正在准备朗读…" : playingParagraphId === "full-article" ? "停止朗读" : "朗读全文"}
          </EnglishButton>
        </>
      }
    >
      {novelIndex && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <EnglishFilterTabs
            tabs={[
              { id: "novel", label: `连载小说 (${allNovelChapters.length}章)` },
              { id: "articles", label: `自定义文章 (${articles.length})` },
            ]}
            value={sourceMode}
            onChange={(val) => setSourceMode(val as "novel" | "articles")}
            ariaLabel="阅读内容来源"
            c={c}
          />
          {sourceMode === "novel" && (
            <div className="flex items-center gap-2">
              <EnglishButton variant="ghost" c={c} onClick={() => stepNovelChapter(-1)}>
                ← 上一章
              </EnglishButton>
              <EnglishButton variant="ghost" c={c} onClick={() => stepNovelChapter(1)}>
                下一章 →
              </EnglishButton>
            </div>
          )}
        </div>
      )}
    </EnglishPageHeader>
    <Card c={c}>
      <div className="p-5 md:p-8">
        <div className="w-full">
          {paragraphs.map((paragraph, paragraphIndex) => {
            const matchingLineIds = [paragraph.id, ...paragraph.legacyLineIds];
            const notes = progress.annotations.filter((note) => matchingLineIds.includes(note.lineId));
            const segments = buildAnnotatedSegments(paragraph.text, notes);
            let sourceCursor = 0;
            return <div key={paragraph.id} data-reading-line={paragraph.id} onMouseUp={(event) => { if (!(event.target instanceof HTMLElement && event.target.closest("button"))) void captureSelection(paragraph.id, paragraph.text); }} className={paragraphIndex === 0 ? "select-text rounded-xl px-3 py-2" : "mt-6 border-t pt-6 select-text rounded-xl px-3 py-2"} style={{ borderColor: c.borderSub }}>
              <p className="type-english" style={{ color: c.fg }}>
                {segments.map((segment, index) => {
                  const startIndex = paragraph.text.indexOf(segment.text, sourceCursor);
                  sourceCursor = startIndex + segment.text.length;
                  return segment.translation
                    ? <span key={`${segment.text}-${index}`} data-reading-segment data-reading-start={startIndex} className="relative mx-0.5 inline-block align-baseline leading-none"><span data-reading-original>{segment.text}</span><span className="group absolute left-1/2 top-[calc(100%+0.2rem)] inline-flex -translate-x-1/2 items-center whitespace-nowrap font-sans text-sm font-normal leading-none" style={{ color: c.accent }}><span>{segment.translation}</span><button type="button" onClick={() => removeNote(matchingLineIds, segment.text, startIndex)} className="absolute left-full top-1/2 ml-1 grid size-4 -translate-y-1/2 place-items-center rounded-full type-caption opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100" style={{ background: c.card, border: `1px solid ${c.accent}`, color: c.accent }} aria-label={`删除 ${segment.text} 的释义`}>×</button></span></span>
                    : <span key={`${segment.text}-${index}`} data-reading-segment data-reading-start={startIndex}>{segment.text}</span>;
                })}
              </p>
            </div>;
          })}
          {audioMessage && <p className="mt-4 text-sm" style={{ color: c.danger }}>{audioMessage}</p>}
          {message && <p className="mt-4 text-sm" style={{ color: c.danger }}>{message}</p>}
        </div>
      </div>
    </Card>

    {sourceMode === "novel" && novelChapter?.studyGuide && (
      <Card c={c}>
        <div className="p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold" style={{ color: c.fg }}>情节提示与本章重点</h3>
              <p className="mt-1 text-xs" style={{ color: c.fgMuted }}>先自己读英文故事，卡壳或读完后再展开核对</p>
            </div>
            <EnglishButton variant="secondary" c={c} onClick={() => setShowStudyGuide((v) => !v)}>
              {showStudyGuide ? "收起讲解" : "展开讲解"}
            </EnglishButton>
          </div>
          {showStudyGuide && (
            <div className="mt-4 rounded-xl p-4 whitespace-pre-line text-sm leading-relaxed" style={{ background: c.inputBg, color: c.fgSub }}>
              {novelChapter.studyGuide}
            </div>
          )}
        </div>
      </Card>
    )}

    <Card c={c}>
      <div className="p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold" style={{ color: c.fg }}>章末口头复述（用 2~3 句英文讲清大意）</h3>
            <p className="mt-1 text-xs" style={{ color: c.fgMuted }}>不看原文试着自己组织语言复述，锻炼“读完就能说出来”的能力</p>
          </div>
          <EnglishButton variant={summaryMic ? "danger" : "secondary"} c={c} onClick={toggleSummaryVoice}>
            {summaryMic ? "停止录音" : "语音复述输入"}
          </EnglishButton>
        </div>
        <textarea
          value={summaryText}
          onChange={(e) => setSummaryText(e.target.value)}
          rows={3}
          placeholder="例如：Ronan's dad sold his red bike because the family needed money for a new home..."
          className="mt-4 w-full resize-y rounded-xl border px-4 py-3 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-blue-500/40"
          style={{ background: c.inputBg, borderColor: c.inputBorder, color: c.fg }}
        />
        {summaryError && <p className="mt-2 text-xs" style={{ color: c.danger }}>{summaryError}</p>}
        <div className="mt-3 flex justify-end">
          <EnglishButton variant="primary" c={c} disabled={summaryBusy || !summaryText.trim()} onClick={() => void submitSummary()}>
            {summaryBusy ? "AI 正在点评…" : "提交复述点评"}
          </EnglishButton>
        </div>
        {summaryResult && (
          <div className="mt-4 rounded-xl p-4 space-y-2" style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: c.fg }}>复述点评</span>
              <span className="type-title" style={{ color: c.accent }}>{summaryResult.score} 分</span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: c.fgSub }}>{summaryResult.feedback}</p>
            {summaryResult.improvements.length > 0 && (
              <ul className="text-xs space-y-1 pt-1" style={{ color: c.fgMuted }}>
                {summaryResult.improvements.map((tip) => <li key={tip}>· {tip}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
    </Card>

    <Card c={c}>
      <div className="p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-base font-semibold" style={{ color: c.fg }}>AI 阅读理解</h3><EnglishButton variant="secondary" c={c} className="shrink-0" disabled={quizBusy} onClick={() => void generateQuiz()}>{quizBusy && !quiz ? "AI 正在出题…" : quiz ? "重新出题" : "AI 出题"}</EnglishButton></div>
        {quiz && <div className="mt-5 space-y-5">{quiz.questions.map((question, index) => <section key={question.id} className="rounded-xl p-4" style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}><p className="text-sm font-semibold leading-relaxed" style={{ color: c.fg }}>{index + 1}. {question.question}</p>{question.type === "choice" ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{question.options.map((option, optionIndex) => <label key={option} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm" style={{ background: quizAnswers[question.id] === option ? `${c.accent}12` : c.card, color: c.fgSub }}><input type="radio" name={question.id} value={option} checked={quizAnswers[question.id] === option} onChange={() => { setQuizAnswers((current) => ({ ...current, [question.id]: option })); setQuizResult(null); }} />{String.fromCharCode(65 + optionIndex)}. {option}</label>)}</div> : <input value={quizAnswers[question.id] ?? ""} onChange={(event) => { setQuizAnswers((current) => ({ ...current, [question.id]: event.target.value })); setQuizResult(null); }} placeholder="Write a short answer in English…" className="mt-3 w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ background: c.card, border: `1px solid ${c.inputBorder}`, color: c.fg }} />}{quizResult && <p className="mt-3 text-sm leading-relaxed" style={{ color: quizResult.answers.find((answer) => answer.id === question.id)?.correct ? c.accent : c.fgSub }}>{quizResult.answers.find((answer) => answer.id === question.id)?.correct ? "回答正确。" : "可以再看看这里："} {quizResult.answers.find((answer) => answer.id === question.id)?.explanation}</p>}</section>)}<div className="flex justify-end"><EnglishButton variant="primary" c={c} disabled={quizBusy} onClick={() => void submitQuiz()}>{quizBusy ? "AI 正在判卷…" : "提交判卷"}</EnglishButton></div></div>}
        {quizMessage && <p className="mt-4 text-sm" style={{ color: c.danger }}>{quizMessage}</p>}
        {quizResult && <section className="mt-5 rounded-xl p-4" style={{ background: `${c.accent}0d`, border: `1px solid ${c.borderSub}` }}><p className="type-title" style={{ color: c.accent }}>{quizResult.score} 分</p><p className="mt-2 text-sm leading-relaxed" style={{ color: c.fgSub }}>{quizResult.feedback}</p></section>}
        <div className="mt-5 flex justify-end border-t pt-5" style={{ borderColor: c.borderSub }}>
          <EnglishButton variant="primary" c={c} onClick={completeGroup}>{sourceMode === "novel" ? "读完本章，进入下一章 →" : "完成本组并进入下一组"}</EnglishButton>
        </div>
      </div>
    </Card>

    {pending && <div className="fixed z-[60] w-80 -translate-x-1/2 rounded-2xl p-4 zen-card zen-modal" style={{ left: pending.x, top: pending.y }}>
      <p className="text-xs" style={{ color: c.fgMuted }}>“{pending.text}”</p>
      <p className="mt-2 text-base font-semibold" style={{ color: c.fg }}>{busy ? "正在翻译…" : pending.translation || "暂未获得译文"}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2"><EnglishButton variant="primary" c={c} disabled={busy || !pending.translation} onClick={addAnnotation}>添加到文中</EnglishButton><EnglishButton variant="secondary" c={c} disabled={busy || !pending.translation || chunkSaved} onClick={saveSelectionAsChunk}>{chunkSaved ? "已存语块 ✓" : "收藏语块"}</EnglishButton><EnglishButton variant="ghost" c={c} onClick={() => setPending(null)}>关闭</EnglishButton></div>
    </div>}
  </div>;
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

