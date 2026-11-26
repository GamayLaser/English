import { hueDimOf, hueOf } from "../theme/palette";
import { Button, Card, SearchField, cardWashStyle } from "../components/ui";
import { loadUserChunks } from "../features/chunks/chunksStore";
import { speakVocabText } from "../features/vocab/vocabStore";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { loadAiSettings } from "../features/english/aiSettings";
import { evaluateTranslation } from "../features/english/deepseekEvaluator";
import { createPracticeSet, type PracticeDirectionMode } from "../features/english/practiceScheduler";
import { AUTO_ADVANCE_MS, shouldAutoAdvance, shouldFocusAnswerInput } from "../features/english/practiceFlow";
import { importWorkbook, loadSentenceLibrary, saveSentenceLibrary } from "../features/english/sentenceLibrary";
import { loadSentenceLearningStats, recordSentenceAttempt } from "../features/english/learningStats";
import { clearTranslationPracticeSession, loadReports, loadSchedulerHistory, loadTranslationPracticeSession, loadWrongBook, saveReports, saveSchedulerHistory, saveTranslationPracticeSession, upsertWrongBookItem, type TranslationPracticeSession } from "../features/english/storage";
import { loadReadingReports } from "../features/reading/readingProgress";
import { formatWritingReportTitle, loadWritingReports, type WritingReport } from "../features/writing/writingProgress";
import { formatListeningReportTitle, loadListeningReports } from "../features/listening/listeningProgress";
import { englishRefreshTargets, type WorkspaceUpdate } from "../features/persistence/workspaceUpdateRouting";
import { EnglishFilterTabs, EnglishPageHeader, EnglishSegmentedTabs, EnglishUnderlineTabs } from "../components/english/EnglishUi";
import type { ErrorTag, Evaluation, PracticeAttempt, PracticeQuestion, Sentence, WrongBookItem } from "../features/english/types";
import type { ThemeColors } from "../types";

import ReadingPractice from "./ReadingPractice";
import WritingPractice from "./WritingPractice";
import ListeningPractice from "./ListeningPractice";

const VisualVocabulary = lazy(() => import("./CardsPage"));

const labels = { meaning: "词义", grammar: "语法", word_order: "语序", collocation: "搭配", naturalness: "自然度" } as const;
export const translationPromptClassName = "relative overflow-hidden rounded-2xl border px-5 py-7 text-center md:px-10 md:py-10";
type View = "practice" | "reading" | "writing" | "listening" | "vocabulary" | "wrongbook" | "reports";
const isView = (value: string): value is View => ["practice", "reading", "writing", "listening", "vocabulary", "wrongbook", "reports"].includes(value);

type PracticeSourceFilter = "smart" | "chunks" | "builtin";

function createGroup(directionMode: PracticeDirectionMode = "zh2en", sourceFilter: PracticeSourceFilter = "smart") {
  const history = loadSchedulerHistory();
  const baseQuestions = createPracticeSet({
    library: loadSentenceLibrary(),
    wrongBook: loadWrongBook(),
    ...history,
    directionMode,
  });
  const chunkQuestions: PracticeQuestion[] = loadUserChunks()
    .filter((ch) => !ch.mastered && ch.en.trim() && ch.zh.trim())
    .slice(0, sourceFilter === "chunks" ? 20 : 3)
    .map((ch, idx) => ({
      sentence: { id: `chunk:${ch.id}`, en: ch.en, zh: ch.zh, source: "imported" },
      direction: directionMode === "en2zh" ? "en2zh" : directionMode === "mixed" && idx % 2 === 1 ? "en2zh" : "zh2en",
      kind: "review" as const,
      previousIssues: [],
    }));

  const questions =
    sourceFilter === "chunks" && chunkQuestions.length > 0
      ? chunkQuestions
      : sourceFilter === "smart" && chunkQuestions.length > 0
        ? [...chunkQuestions, ...baseQuestions.slice(0, Math.max(1, baseQuestions.length - chunkQuestions.length))]
        : baseQuestions;
  saveSchedulerHistory({ groupsCreated: history.groupsCreated + 1, reviewsAssigned: history.reviewsAssigned + questions.filter((item) => item.kind === "review").length });
  return questions;
}

function createTranslationPracticeSession(directionMode: PracticeDirectionMode = "zh2en", sourceFilter: PracticeSourceFilter = "smart"): TranslationPracticeSession {
  return { questions: createGroup(directionMode, sourceFilter), index: 0, answer: "", attempts: [], evaluation: null };
}

export function loadOrCreateTranslationPracticeSession(): TranslationPracticeSession {
  const session = loadTranslationPracticeSession();
  if (session && session.questions.length > 0 && session.index < session.questions.length) return session;
  clearTranslationPracticeSession();
  return createTranslationPracticeSession();
}

export default function EnglishPage({ c, initialView = "practice", onViewChange, workspaceUpdate = null }: { c: ThemeColors; initialView?: string; onViewChange?: (view: View) => void; workspaceUpdate?: WorkspaceUpdate | null }) {
  const [view, setView] = useState<View>(() => isView(initialView) ? initialView : "practice");
  const [practice, setPractice] = useState<TranslationPracticeSession>(loadOrCreateTranslationPracticeSession);
  const { questions, index, answer, evaluation, attempts } = practice;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [finished, setFinished] = useState(false);
  const [directionMode, setDirectionMode] = useState<PracticeDirectionMode>("zh2en");
  const [sourceFilter, setSourceFilter] = useState<PracticeSourceFilter>("smart");
  const answerInputRef = useRef<HTMLTextAreaElement>(null);
  const lastWorkspaceRevision = useRef(0);
  const [panelRevisions, setPanelRevisions] = useState({ wrongbook: 0, reports: 0 });
  const current = questions[index];
  function replacePractice(next: TranslationPracticeSession) {
    setPractice(next);
    saveTranslationPracticeSession(next);
  }
  const accepted = attempts.filter((item) => item.evaluation.verdict === "acceptable").length;
  const tags = useMemo(() => attempts.flatMap((item) => item.evaluation.errorTags).reduce<Record<string, number>>((all, tag) => ({ ...all, [tag]: (all[tag] ?? 0) + 1 }), {}), [attempts]);

  useEffect(() => {
    if (!workspaceUpdate || lastWorkspaceRevision.current === workspaceUpdate.revision) return;
    lastWorkspaceRevision.current = workspaceUpdate.revision;
    const targets = englishRefreshTargets(workspaceUpdate.keys);
    if (!targets.length) return;
    setPanelRevisions((current) => {
      const next = { ...current };
      for (const target of targets) if (target !== "content") next[target] = workspaceUpdate.revision;
      return next;
    });
  }, [workspaceUpdate?.revision]);

  useEffect(() => {
    if (isView(initialView)) setView(initialView);
  }, [initialView]);

  async function submit() {
    const settings = loadAiSettings();
    if (!settings) { setMessage("请先在「更多 → 后台管理」或侧栏设置中保存 DeepSeek API Key。"); return; }
    if (!answer.trim()) { setMessage("请输入翻译后再提交。"); return; }
    setBusy(true); setMessage("");
    try {
      const result = await evaluateTranslation({ settings, question: current, answer });
      const attempt = { question: current, answer, evaluation: result, completedAt: Date.now() };
      replacePractice({ ...practice, attempts: [...attempts, attempt], evaluation: result });
      recordSentenceAttempt(current.sentence.id, result.score, attempt.completedAt);
      if (result.verdict === "needs_improvement" || current.kind === "review") upsertWrongBookItem(attempt);
    } catch (error) { setMessage(error instanceof Error ? error.message : "模型请求失败，请重试。"); } finally { setBusy(false); }
  }

  function next() {
    if (index === questions.length - 1) {
      saveReports([{ date: new Date().toLocaleDateString("zh-CN"), attempts, createdAt: Date.now() }, ...loadReports()]);
      clearTranslationPracticeSession();
      setFinished(true);
      return;
    }
    replacePractice({ ...practice, index: index + 1, answer: "", evaluation: null }); setMessage("");
  }

  function restart(nextDir = directionMode, nextSource = sourceFilter) {
    replacePractice(createTranslationPracticeSession(nextDir, nextSource)); setFinished(false); setMessage(""); setView("practice");
  }

  useEffect(() => {
    if (!evaluation || !shouldAutoAdvance(evaluation.verdict) || view !== "practice") return;
    const timer = window.setTimeout(next, AUTO_ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [evaluation, index, view]);

  useEffect(() => {
    if (!shouldFocusAnswerInput({ view, hasEvaluation: Boolean(evaluation), finished })) return;
    const frame = window.requestAnimationFrame(() => answerInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [index, evaluation, finished, view]);

  function changeView(nextView: View) {
    if (nextView !== "practice" && evaluation && shouldAutoAdvance(evaluation.verdict)) replacePractice({ ...practice, evaluation: null });
    setView(nextView);
    onViewChange?.(nextView);
  }

  return <div className="flex min-h-0 flex-col md:h-full">
    <div className="min-h-0 flex-1"><Suspense fallback={<div className="py-12 text-center text-sm" style={{ color: c.fgMuted }}>正在加载练习…</div>}>{view === "vocabulary" ? <VisualVocabulary mode="word" c={c} /> : view === "reading" ? <ReadingPractice c={c} workspaceUpdate={workspaceUpdate} /> : view === "writing" ? <WritingPractice c={c} workspaceUpdate={workspaceUpdate} /> : view === "listening" ? <ListeningPractice c={c} workspaceUpdate={workspaceUpdate} /> : view === "wrongbook" ? <WrongBookDetails key={panelRevisions.wrongbook} c={c} onStartPractice={() => changeView("practice")} /> : view === "reports" ? <ReportHistory key={panelRevisions.reports} c={c} /> : finished ? <Completed c={c} total={questions.length} accepted={accepted} tags={tags} attempts={attempts} onRestart={() => restart()} onWrongBook={() => changeView("wrongbook")} /> : <TranslationPractice c={c} index={index} total={questions.length} current={current} answer={answer} setAnswer={(nextAnswer) => replacePractice({ ...practice, answer: nextAnswer })} evaluation={evaluation} busy={busy} message={message} inputRef={answerInputRef} directionMode={directionMode} sourceFilter={sourceFilter} onChangeMode={(m) => { setDirectionMode(m); restart(m, sourceFilter); }} onChangeSource={(s) => { setSourceFilter(s); restart(directionMode, s); }} onSubmit={submit} onNext={next} />}</Suspense></div>
  </div>;
}

export const translationAnswerStageClassName = "w-full rounded-xl border p-4 md:p-6";

export function TranslationPractice({ c, index, total, current, answer, setAnswer, evaluation, busy, message, inputRef, directionMode, sourceFilter, onChangeMode, onChangeSource, onSubmit, onNext }: { c: ThemeColors; index: number; total: number; current: PracticeQuestion; answer: string; setAnswer: (value: string) => void; evaluation: Evaluation | null; busy: boolean; message: string; inputRef: React.RefObject<HTMLTextAreaElement | null>; directionMode: PracticeDirectionMode; sourceFilter: PracticeSourceFilter; onChangeMode: (m: PracticeDirectionMode) => void; onChangeSource: (s: PracticeSourceFilter) => void; onSubmit: () => void; onNext: () => void }) {
  const prompt = current.direction === "en2zh" ? current.sentence.en : current.sentence.zh;
  const [micActive, setMicActive] = useState(false);
  const micRef = useRef<{ stop: () => void } | null>(null);
  const hasSpeech = typeof window !== "undefined" && Boolean((window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition);

  function toggleVoiceAnswer() {
    if (micActive) {
      micRef.current?.stop();
      setMicActive(false);
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
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = current.direction === "zh2en" ? "en-US" : "zh-CN";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const text = e.results?.[0]?.[0]?.transcript?.trim();
      if (text) setAnswer(answer ? `${answer} ${text}` : text);
    };
    rec.onerror = () => setMicActive(false);
    rec.onend = () => setMicActive(false);
    micRef.current = rec;
    setMicActive(true);
    rec.start();
  }

  function onAnswerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || busy || evaluation || !answer.trim()) return;
    event.preventDefault();
    onSubmit();
  }
  return <div className="container-focus space-y-5 pb-8 zen-page-enter">
    <EnglishPageHeader
      c={c}
      eyebrow="TRANSLATION PRACTICE"
      title="句子翻译 · 口译输出"
      description="默认以汉译英为主，支持语音口译输入与 AI 5 维精批。"
      aside={
        <div className="flex items-center gap-3 rounded-xl px-3.5 py-2" style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}>
          <span className="type-title zen-tnum" style={{ color: c.fg }}>{String(index + 1).padStart(2, "0")}</span>
          <span className="text-xs zen-tnum" style={{ color: c.fgMuted }}>/ {String(total).padStart(2, "0")}</span>
          <div className="h-1.5 w-20 overflow-hidden rounded-full" style={{ background: c.card }}>
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${((index + 1) / total) * 100}%`, background: c.accent }} />
          </div>
        </div>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <EnglishSegmentedTabs
          tabs={[
            { id: "zh2en", label: "汉译英（口译）" },
            { id: "en2zh", label: "英译汉" },
            { id: "mixed", label: "混合" },
          ]}
          value={directionMode}
          onChange={(v) => onChangeMode(v as PracticeDirectionMode)}
          ariaLabel="翻译方向模式"
          c={c}
        />
        <select
          value={sourceFilter}
          onChange={(e) => onChangeSource(e.target.value as PracticeSourceFilter)}
          className="min-h-8 rounded-lg border px-2.5 py-1 text-xs font-medium outline-none"
          style={{ background: c.inputBg, borderColor: c.inputBorder, color: c.fg }}
          aria-label="选择语料来源"
        >
          <option value="smart">智能调度（错题+语块）</option>
          <option value="chunks">个人语块本优先</option>
          <option value="builtin">内置句库</option>
        </select>
      </div>
    </EnglishPageHeader>
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center gap-2 px-1">
        <span className="text-xs font-semibold tracking-[0.14em]" style={{ color: c.accent }}>{current.direction === "en2zh" ? "ENGLISH → CHINESE" : "CHINESE → ENGLISH"}</span>
        {current.kind === "review" && <span className="rounded-md px-2 py-0.5 text-xs font-medium" style={{ background: c.accentDim, color: c.accent }}>复习题</span>}
      </div>
      {current.kind === "review" && current.previousIssues.length > 0 && <p className="rounded-xl px-4 py-2.5 text-sm" style={{ background: c.inputBg, color: c.fgMuted, border: `1px solid ${c.borderSub}` }}>上次薄弱点：{current.previousIssues.map((item) => labels[item.category]).join("、")}</p>}
      <div data-testid="translation-prompt" className={translationPromptClassName} style={{ background: "var(--bg-surface)", borderColor: "var(--border-subtle)" }}>
        <p data-testid="translation-prompt-text" className="mx-auto w-full break-words type-prompt" style={{ color: c.fg }}>{prompt}</p>
      </div>
      {!evaluation ? <>
        <div className="w-full rounded-2xl border p-4 md:p-6 zen-card" style={{ borderColor: "var(--border-subtle)" }}>
          <label htmlFor="translation-answer" className="mb-2.5 block text-sm font-semibold" style={{ color: c.fg }}>你的译文</label>
          <textarea id="translation-answer" data-testid="translation-answer" aria-label="你的翻译" rows={3} ref={inputRef} value={answer} onChange={(event) => setAnswer(event.target.value)} onKeyDown={onAnswerKeyDown} placeholder="在这里输入你的译文，或点击下方语音口译输入…" className="w-full resize-y rounded-xl border px-4 py-3 text-base leading-7 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 md:min-h-32" style={{ background: c.inputBg, borderColor: c.inputBorder, color: c.fg, caretColor: c.accent }} />
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            {hasSpeech && (
              <Button type="button" variant={micActive ? "danger" : "secondary"} c={c} onClick={toggleVoiceAnswer}>
                {micActive ? "停止口译录音" : "语音口译输入"}
              </Button>
            )}
            <Button type="button" variant="primary" c={c} aria-label="提交翻译" disabled={busy || !answer.trim()} onClick={onSubmit} className="w-full sm:w-auto">{busy ? "正在提交…" : "提交译文"}</Button>
          </div>
        </div>
        {message && <p className="text-sm" style={{ color: c.danger }}>{message}</p>}
      </> : <><Feedback c={c} answer={answer} evaluation={evaluation} />{shouldAutoAdvance(evaluation.verdict) ? <AutoAdvance c={c} /> : <Button type="button" variant="primary" c={c} className="self-center" onClick={onNext}>{index === total - 1 ? "完成练习" : "下一题"}</Button>}</>}
    </div>
  </div>;
}

export function AutoAdvance({ c }: { c: ThemeColors }) {
  return <div className="self-center rounded-xl px-5 py-3 text-center" style={{ background: c.successDim, color: c.success }}><p className="text-sm font-semibold">回答正确，即将自动进入下一题</p><div className="mt-2 h-1.5 w-52 overflow-hidden rounded-full" style={{ background: c.inputBg }}><div data-testid="auto-advance-progress" className="h-full w-full rounded-full" style={{ background: c.success, transformOrigin: "left", animation: `auto-advance-progress ${AUTO_ADVANCE_MS}ms linear forwards` }} /></div></div>;
}

function SentenceLibraryView({ c }: { c: ThemeColors }) {
  const [sentences, setSentences] = useState(loadSentenceLibrary);
  const [stats, setStats] = useState(loadSentenceLearningStats);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = normalizedQuery ? sentences.filter((item) => `${item.en} ${item.zh}`.toLocaleLowerCase().includes(normalizedQuery)) : sentences;
  const builtInCount = sentences.filter((item) => item.source !== "imported").length;
  const importedCount = sentences.length - builtInCount;

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.name.toLocaleLowerCase().endsWith(".xlsx")) { setMessage("请选择 .xlsx 格式的 Excel 文件。"); return; }
    try {
      const result = await importWorkbook(await file.arrayBuffer(), sentences);
      const next = [...sentences, ...result.added];
      saveSentenceLibrary(next);
      setSentences(next);
      setStats(loadSentenceLearningStats());
      setMessage(`已新增 ${result.added.length} 条；跳过重复 ${result.duplicates} 条、无效 ${result.invalid} 条。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Excel 导入失败，请重试。");
    }
  }

  return <Card c={c}><div className="p-5 md:p-8"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><h2 className="text-xl font-semibold" style={{ color: c.fg }}>句子库</h2><p className="mt-2 text-sm leading-relaxed" style={{ color: c.fgMuted }}>练习会从这里抽取小学英语日常句子。中文是参考释义，AI 会接受意思相同的不同译法。</p></div><div className="flex gap-2"><input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={upload} /><Button type="button" variant="primary" c={c} onClick={() => inputRef.current?.click()}>导入 Excel</Button></div></div><div className="mt-6 grid grid-cols-3 gap-3"><LibraryStat c={c} label="全部句子" value={sentences.length} color={c.success} /><LibraryStat c={c} label="内置句子" value={builtInCount} color={c.info} /><LibraryStat c={c} label="导入句子" value={importedCount} color={hueOf(c, "violet")} /></div><div className="mt-5 rounded-xl px-4 py-3 text-sm" style={{ background: c.inputBg, color: c.fgMuted }}><b style={{ color: c.fg }}>Excel 格式：</b>第一行填写表头 <code className="rounded px-1.5 py-0.5" style={{ background: c.card }}>英文</code> 和 <code className="rounded px-1.5 py-0.5" style={{ background: c.card }}>中文</code>，只读取第一个工作表。相同英文可保留不同中文参考；完全相同的双语行会自动跳过。</div>{message && <p className="mt-4 text-sm" style={{ color: message.startsWith("已新增") ? c.success : c.danger }}>{message}</p>}<SearchField c={c} className="mt-6" value={query} onChange={setQuery} placeholder="搜索英文或中文…" label="搜索句子" />{visible.length === 0 ? <p className="py-12 text-center text-sm" style={{ color: c.fgMuted }}>没有找到匹配的句子。</p> : <div className="mt-5 columns-1 gap-4 md:columns-2 xl:columns-3">{visible.map((item) => { const stat = stats[item.id]; return <article key={item.id} className="mb-4 break-inside-avoid rounded-xl p-4" style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}><div className="flex items-start justify-between gap-3"><span className="rounded-md px-2 py-1 text-xs" style={{ background: item.source === "imported" ? `${c.accent}15` : c.active, color: item.source === "imported" ? c.accent : c.fgMuted }}>{item.source === "imported" ? "导入" : "内置"}</span><span className="text-right text-xs" style={{ color: stat ? c.accent : c.fgMuted }}>{stat ? `已答 ${stat.attemptCount} 次 · 最高 ${stat.bestScore} 分` : "未答过"}</span></div><p className="mt-5 type-title leading-relaxed" style={{ color: c.fg }}>{item.en}</p><p className="mt-2 text-sm leading-relaxed" style={{ color: c.fgMuted }}>{item.zh}</p>{stat && <p className="mt-5 border-t pt-3 text-xs" style={{ borderColor: c.border, color: c.fgMuted }}>最近作答：{new Date(stat.lastAnsweredAt).toLocaleDateString("zh-CN")}</p>}</article>; })}</div>}</div></Card>;
}

function LibraryStat({ c, label, value, color = c.success }: { c: ThemeColors; label: string; value: number; color?: string }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}
    >
      <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: c.fgMuted }}>{label}</p>
      <p className="mt-1 type-display" style={{ color }}>{value}</p>
    </div>
  );
}

const RADAR_DIMS: { key: ErrorTag; label: string }[] = [
  { key: "meaning", label: "词义" },
  { key: "grammar", label: "语法" },
  { key: "word_order", label: "语序" },
  { key: "collocation", label: "搭配" },
  { key: "naturalness", label: "自然度" },
];

function computeDimensionScores(evaluation: Evaluation): Record<ErrorTag, number> {
  const base = evaluation.score;
  const dims: Record<ErrorTag, number> = {
    meaning: base,
    grammar: base,
    word_order: base,
    collocation: base,
    naturalness: base,
  };
  for (const issue of evaluation.issues) {
    if (dims[issue.category] !== undefined) {
      dims[issue.category] = Math.max(25, dims[issue.category] - 25);
    }
  }
  for (const key of Object.keys(dims) as ErrorTag[]) {
    if (!evaluation.issues.some((i) => i.category === key)) {
      dims[key] = Math.min(100, Math.max(dims[key], evaluation.verdict === "acceptable" ? Math.max(base, 92) : base));
    }
  }
  return dims;
}

function computeAggregateDimensions(attempts: PracticeAttempt[]): Record<ErrorTag, number> {
  if (attempts.length === 0) {
    return { meaning: 85, grammar: 85, word_order: 85, collocation: 85, naturalness: 85 };
  }
  const totals: Record<ErrorTag, number> = { meaning: 0, grammar: 0, word_order: 0, collocation: 0, naturalness: 0 };
  for (const attempt of attempts) {
    const d = computeDimensionScores(attempt.evaluation);
    for (const key of Object.keys(totals) as ErrorTag[]) {
      totals[key] += d[key];
    }
  }
  const res = {} as Record<ErrorTag, number>;
  for (const key of Object.keys(totals) as ErrorTag[]) {
    res[key] = Math.round(totals[key] / attempts.length);
  }
  return res;
}

function RadarChart5D({ scores, c, size = 220 }: { scores: Record<ErrorTag, number>; c: ThemeColors; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.35;
  const numAxes = RADAR_DIMS.length;

  const angles = RADAR_DIMS.map((_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / numAxes);
  const levels = [0.25, 0.5, 0.75, 1.0];
  const gridPolygons = levels.map((lvl) =>
    angles.map((ang) => `${cx + r * lvl * Math.cos(ang)},${cy + r * lvl * Math.sin(ang)}`).join(" ")
  );

  const dataPoints = RADAR_DIMS.map((dim, i) => {
    const sc = Math.max(15, Math.min(100, scores[dim.key] ?? 70));
    const rad = (sc / 100) * r;
    return {
      x: cx + rad * Math.cos(angles[i]),
      y: cy + rad * Math.sin(angles[i]),
      dim,
      score: sc,
    };
  });
  const dataPolyStr = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="relative inline-flex flex-col items-center select-none" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="overflow-visible">
        <defs>
          <radialGradient id="radarFillGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={c.accent} stopOpacity="0.45" />
            <stop offset="100%" stopColor={c.accent} stopOpacity="0.12" />
          </radialGradient>
        </defs>

        {gridPolygons.map((poly, idx) => (
          <polygon
            key={idx}
            points={poly}
            fill={idx === levels.length - 1 ? "var(--accent-soft)" : "none"}
            stroke="var(--border-subtle)"
            strokeWidth={1}
            strokeDasharray={idx < levels.length - 1 ? "2,2" : undefined}
          />
        ))}

        {angles.map((ang, idx) => (
          <line
            key={idx}
            x1={cx}
            y1={cy}
            x2={cx + r * Math.cos(ang)}
            y2={cy + r * Math.sin(ang)}
            stroke="var(--border-subtle)"
            strokeWidth={1}
          />
        ))}

        <polygon
          points={dataPolyStr}
          fill="url(#radarFillGrad)"
          stroke={c.accent}
          strokeWidth={2}
          strokeLinejoin="round"
          style={{
            transition: "all 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />

        {dataPoints.map((pt, idx) => (
          <circle
            key={idx}
            cx={pt.x}
            cy={pt.y}
            r={3.5}
            fill={c.accent}
            stroke={c.card}
            strokeWidth={1.5}
            style={{ transition: "all 0.6s cubic-bezier(0.16, 1, 0.3, 1)" }}
          />
        ))}

        {angles.map((ang, idx) => {
          const labelDist = r + 20;
          const lx = cx + labelDist * Math.cos(ang);
          const ly = cy + labelDist * Math.sin(ang);
          const dim = RADAR_DIMS[idx];
          const sc = scores[dim.key] ?? 70;
          return (
            <text
              key={idx}
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={12}
              fontWeight={500}
              fill="var(--text-secondary)"
            >
              {dim.label} {sc}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function ScoreGauge({ score, color }: { score: number; color: string }) {
  const size = 116, r = 46, circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <div className="relative inline-flex items-center justify-center zen-count-up" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`${color}18`} strokeWidth={8} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.16, 1, 0.3, 1)" }} />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="type-display" style={{ color, lineHeight: 1 }}>{score}%</span>
        <span className="type-caption mt-1 font-medium opacity-60">正确率</span>
      </div>
    </div>
  );
}

function Feedback({ c, answer, evaluation }: { c: ThemeColors; answer: string; evaluation: Evaluation }) {
  const good = evaluation.verdict === "acceptable";
  const badgeColor = good ? c.success : c.danger;
  const dimScores = computeDimensionScores(evaluation);

  return (
    <div className="w-full space-y-4 zen-page-enter">
      {/* Soft status banner */}
      <div
        className="rounded-2xl p-5 border-l-4 zen-card"
        style={{
          borderLeftColor: badgeColor,
          background: good ? "var(--bg-surface)" : undefined,
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: badgeColor }} />
            <b className="text-sm font-semibold" style={{ color: badgeColor }}>
              {good ? "表达地道 · 可接受" : "存在偏差 · 需要改进"}
            </b>
          </div>
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-lg zen-tnum"
            style={{ background: good ? c.successDim : c.dangerDim, color: badgeColor }}
          >
            {evaluation.score} 分
          </span>
        </div>
        <p className="mt-2.5 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {evaluation.feedback}
        </p>
      </div>

      {/* Diff-style 2-column Comparison + Radar */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
        <div className="grid gap-3">
          {/* Your Answer */}
          <div
            className="rounded-xl p-4"
            style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-subtle)" }}
          >
            <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
              你的表达
            </p>
            <p
              className={`mt-1.5 text-[15px] font-medium leading-relaxed ${!good ? "underline decoration-red-400/70 decoration-wavy underline-offset-4" : ""
                }`}
              style={{ color: "var(--text-primary)" }}
            >
              {answer}
            </p>
          </div>

          {/* Native Reference Expressions */}
          <div
            className="rounded-xl p-4"
            style={{ background: "var(--accent-soft)", border: "1px solid var(--border-subtle)" }}
          >
            <p className="text-xs font-semibold mb-2.5" style={{ color: "var(--accent-primary)" }}>
              地道参考表达（点击朗读跟读）
            </p>
            <div className="space-y-2">
              {evaluation.acceptedTranslations.map((item) => (
                <div key={item} className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {item}
                  </span>
                  <button
                    type="button"
                    onClick={() => speakVocabText(item, 0.9)}
                    className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium cursor-pointer"
                    style={{ background: "var(--bg-surface)", color: "var(--accent-primary)" }}
                  >
                    朗读
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 5-Dimension Radar */}
        <div
          className="rounded-xl p-4 flex flex-col items-center justify-center shrink-0"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
        >
          <span className="text-xs font-semibold mb-1" style={{ color: "var(--text-muted)" }}>
            5维维度评分
          </span>
          <RadarChart5D scores={dimScores} c={c} size={180} />
        </div>
      </div>

      {/* Subtle issue notes */}
      {evaluation.issues.length > 0 && (
        <div className="space-y-2">
          {evaluation.issues.map((issue, issueIndex) => (
            <div
              key={issueIndex}
              className="rounded-xl p-3.5 border-l-2"
              style={{
                background: "var(--bg-subtle)",
                borderLeftColor: c.danger,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-[11px] px-2 py-0.5 rounded-md font-medium"
                  style={{ background: c.dangerDim, color: c.danger }}
                >
                  {labels[issue.category]}
                </span>
                <span className="text-xs font-medium" style={{ color: "var(--accent-primary)" }}>
                  建议：{issue.suggestion}
                </span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {issue.explanation}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Completed({ c, total, accepted, tags, attempts, onRestart, onWrongBook }: { c: ThemeColors; total: number; accepted: number; tags: Record<string, number>; attempts: PracticeAttempt[]; onRestart: () => void; onWrongBook: () => void }) {
  const pct = Math.round((accepted / total) * 100);
  const aggScores = computeAggregateDimensions(attempts);

  return (
    <Card c={c}>
      <div className="mx-auto max-w-3xl p-6 text-center zen-page-enter md:p-8">
        <h2 className="type-page mb-2" style={{ color: c.fg }}>本组练习完成 🎉</h2>
        <p className="text-sm" style={{ color: c.fgMuted }}>
          共 {total} 道题目，{accepted} 道表达地道 · 错题已自动归入复习队列
        </p>

        {/* Accuracy Gauge & 5-D Radar Chart Side by Side */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-8 my-6 py-4 border-y" style={{ borderColor: c.borderSub }}>
          <div className="flex flex-col items-center zen-achievement">
            <ScoreGauge score={pct} color={pct >= 80 ? c.success : pct >= 60 ? c.info : c.warning} />
          </div>
          <div className="h-28 w-px hidden sm:block" style={{ background: c.borderSub }} />
          <div className="flex flex-col items-center">
            <span className="text-xs font-semibold mb-2" style={{ color: c.fgMuted }}>5维综合能力雷达</span>
            <RadarChart5D scores={aggScores} c={c} size={210} />
          </div>
        </div>

        {/* Stats summary row */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div
            className="rounded-xl p-4"
            style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}
          >
            <span className="text-xs font-semibold" style={{ color: c.fgMuted }}>总题数</span>
            <p className="type-display mt-1" style={{ color: c.fg }}>{total}</p>
          </div>
          <div
            className="rounded-xl p-4"
            style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}
          >
            <span className="text-xs font-semibold" style={{ color: c.accent }}>可接受</span>
            <p className="type-display mt-1" style={{ color: c.accent }}>{accepted}</p>
          </div>
          <div
            className="rounded-xl p-4"
            style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}
          >
            <span className="text-xs font-semibold" style={{ color: c.danger }}>需巩固</span>
            <p className="type-display mt-1" style={{ color: c.danger }}>{total - accepted}</p>
          </div>
        </div>

        {Object.keys(tags).length > 0 && (
          <div className="mt-6 grid grid-cols-1 gap-3 text-left md:grid-cols-2">
            {Object.entries(tags).map(([tag, count]) => (
              <div key={tag} className="rounded-xl p-4 border" style={{ background: c.inputBg, borderColor: c.borderSub }}>
                <p className="text-sm font-semibold flex items-center justify-between" style={{ color: c.fg }}>
                  <span>{labels[tag as keyof typeof labels] || tag}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${c.danger}18`, color: c.danger }}>{count} 次待加强</span>
                </p>
                <p className="mt-1 text-xs" style={{ color: c.fgMuted }}>后续练习将按 30% 比例自动调度复习此类句式。</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 flex justify-center gap-3">
          <Button type="button" variant="primary" c={c} onClick={onRestart}>开始下一组</Button>
          <Button type="button" variant="secondary" c={c} onClick={onWrongBook}>查看错题本</Button>
        </div>
      </div>
    </Card>
  );
}

function WrongBookDetails({ c, onStartPractice }: { c: ThemeColors; onStartPractice: () => void }) {
  const items: WrongBookItem[] = loadWrongBook().sort((a, b) => b.wrongCount - a.wrongCount || a.lastReviewedAt - b.lastReviewedAt);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="container-focus space-y-5 pb-8 zen-page-enter">
      <EnglishPageHeader
        c={c}
        eyebrow="REVIEW QUEUE"
        title="错题本"
        description="下一组练习按 30% 比例自动抽取这些题目；错得更多、越久未复习的优先。"
        aside={
          <div className="flex items-center gap-2">
            <span className="rounded-xl px-3 py-2 text-xs font-semibold zen-tnum" style={{ background: c.inputBg, color: c.fgMuted }}>
              共 {items.length} 题
            </span>
            <Button type="button" variant="primary" c={c} onClick={onStartPractice}>
              开始错题强化
            </Button>
          </div>
        }
      />

      {items.length === 0 ? (
        <Card c={c}>
          <p className="py-14 text-center text-sm" style={{ color: c.fgMuted }}>还没有需要复习的题目。</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const isOpen = expandedId === item.sentence.id;
            return (
              <Card key={item.sentence.id} c={c} className="p-5 space-y-3">
                {/* Top Header */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <p className="text-base font-bold leading-snug" style={{ color: "var(--text-primary)" }} lang="en">
                        {item.sentence.en}
                      </p>
                      <button
                        type="button"
                        onClick={() => speakVocabText(item.sentence.en, 0.9)}
                        className="shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-medium cursor-pointer"
                        style={{ background: c.accentDim, color: c.accent }}
                      >
                        朗读
                      </button>
                    </div>
                    <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                      {item.sentence.zh}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="rounded-full px-2.5 py-1 text-[11px] font-medium zen-tnum"
                      style={{ background: "var(--bg-subtle)", color: "var(--text-muted)" }}
                    >
                      错 {item.wrongCount} 次 · 复习 {item.reviewCount} 次
                    </span>
                    <Button type="button" variant="secondary" c={c} onClick={onStartPractice}>
                      强化
                    </Button>
                  </div>
                </div>

                {/* Middle Diff Bar */}
                {item.latestAttempt && (
                  <div
                    className="rounded-xl px-3.5 py-2.5 text-xs flex flex-wrap items-center gap-2"
                    style={{ background: "var(--bg-subtle)" }}
                  >
                    <span className="line-through opacity-75" style={{ color: "var(--text-muted)" }}>
                      {item.latestAttempt.answer}
                    </span>
                    <span style={{ color: "var(--text-muted)" }}>→</span>
                    <span className="font-semibold" style={{ color: "var(--accent-primary)" }}>
                      {item.latestAttempt.evaluation.acceptedTranslations[0] || item.sentence.en}
                    </span>
                  </div>
                )}

                {/* Bottom Tags & Collapsible Feedback */}
                {item.latestAttempt && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1.5">
                        {item.latestAttempt.evaluation.issues.map((issue, idx) => (
                          <span
                            key={idx}
                            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                            style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}
                          >
                            {labels[issue.category]}
                          </span>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpandedId(isOpen ? null : item.sentence.id)}
                        className="text-xs font-medium cursor-pointer"
                        style={{ color: c.accent }}
                      >
                        {isOpen ? "收起解析" : "展开解析"}
                      </button>
                    </div>
                    {isOpen && (
                      <p className="text-xs leading-relaxed pt-1" style={{ color: "var(--text-secondary)" }}>
                        {item.latestAttempt.evaluation.feedback}
                      </p>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

const HISTORY_PAGE_SIZE = 5;

function HistoryPager({ page, total, onChange, c }: { page: number; total: number; onChange: (page: number) => void; c: ThemeColors }) {
  const pages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
  if (pages <= 1) return null;
  const visible = pages <= 7 ? Array.from({ length: pages }, (_, index) => index) : Array.from(new Set([0, 1, page - 1, page, page + 1, pages - 2, pages - 1])).filter((item) => item >= 0 && item < pages).sort((a, b) => a - b);
  return <nav className="flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: c.borderSub }} aria-label="历史报告分页"><p className="text-xs" style={{ color: c.fgMuted }}>第 {page + 1} / {pages} 页 · 共 {total} 条</p><div className="flex items-center gap-1"><button type="button" onClick={() => onChange(page - 1)} disabled={page === 0} className="rounded-lg px-3 py-2 text-xs disabled:opacity-40" style={{ background: c.card, color: c.fg }}>上一页</button>{visible.map((item, index) => <span key={item} className="flex items-center gap-1">{index > 0 && item - visible[index - 1] > 1 && <span className="px-1 text-xs" style={{ color: c.fgMuted }}>…</span>}<button type="button" onClick={() => onChange(item)} className="min-w-8 rounded-lg px-2 py-2 text-xs font-semibold" style={{ background: item === page ? c.accent : c.card, color: item === page ? c.accentFg : c.fg }}>{item + 1}</button></span>)}<button type="button" onClick={() => onChange(page + 1)} disabled={page === pages - 1} className="rounded-lg px-3 py-2 text-xs disabled:opacity-40" style={{ background: c.card, color: c.fg }}>下一页</button></div></nav>;
}

function HistoryDetailHeader({ title, subtitle, onBack, c }: { title: string; subtitle: string; onBack: () => void; c: ThemeColors }) {
  return <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold" style={{ color: c.fg }}>{title}</h2><p className="mt-1 text-sm" style={{ color: c.fgMuted }}>{subtitle}</p></div><Button type="button" variant="secondary" c={c} onClick={onBack}>返回列表</Button></div>;
}

function TranslationReportHistory({ c }: { c: ThemeColors }) {
  const reports = loadReports();
  const [page, setPage] = useState(0);
  const [selectedAt, setSelectedAt] = useState<number | null>(null);
  const selected = reports.find((report) => report.createdAt === selectedAt);
  if (selected) return <TranslationReportDetail report={selected} onBack={() => setSelectedAt(null)} c={c} />;
  const visibleReports = reports.slice(page * HISTORY_PAGE_SIZE, (page + 1) * HISTORY_PAGE_SIZE);
  return <Card c={c}><div className="p-5 md:p-6"><h2 className="text-base font-semibold" style={{ color: c.fg }}>翻译报告</h2><p className="mt-1 text-sm" style={{ color: c.fgMuted }}>每页展示 5 组练习；点击进入独立详情，回看大量报告时更清晰。</p>{reports.length === 0 ? <p className="py-10 text-center text-sm" style={{ color: c.fgMuted }}>完成一组练习后，这里会生成详细报告。</p> : <><div className="mt-5 space-y-3">{visibleReports.map((report) => { const correct = report.attempts.filter((item) => item.evaluation.verdict === "acceptable").length; const rate = Math.round((correct / Math.max(report.attempts.length, 1)) * 100); return <button type="button" key={report.createdAt} onClick={() => setSelectedAt(report.createdAt)} className="grid w-full grid-cols-1 sm:grid-cols-[1.2fr_1fr_auto] items-center gap-4 rounded-xl p-4 text-left transition-colors hover:brightness-95 cursor-pointer" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-subtle)" }}><div><p className="text-sm font-semibold" style={{ color: c.fg }}>{report.date} · {new Date(report.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</p><p className="mt-1 text-xs" style={{ color: c.fgMuted }}>{correct} / {report.attempts.length} 可接受</p></div><div className="flex items-center gap-2.5"><div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: c.card }}><div className="h-full rounded-full" style={{ width: `${rate}%`, background: c.accent }} /></div><span className="text-xs font-semibold zen-tnum" style={{ color: c.accent }}>{rate}%</span></div><span className="text-xs font-medium justify-self-end" style={{ color: c.accent }}>查看详情 →</span></button>; })}</div><div className="mt-5"><HistoryPager page={page} total={reports.length} onChange={setPage} c={c} /></div></>}</div></Card>;
}

function TranslationReportDetail({ report, onBack, c }: { report: ReturnType<typeof loadReports>[number]; onBack: () => void; c: ThemeColors }) {
  const correct = report.attempts.filter((item) => item.evaluation.verdict === "acceptable").length;
  return <Card c={c}><div className="p-6 md:p-8"><HistoryDetailHeader title={`${report.date} · 第 ${new Date(report.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 组`} subtitle={`${correct} / ${report.attempts.length} 可接受 · 正确率 ${Math.round((correct / Math.max(report.attempts.length, 1)) * 100)}%`} onBack={onBack} c={c} /><div className="mt-5 space-y-3">{report.attempts.map((item, attemptIndex) => <div key={item.completedAt} className="rounded-xl p-4" style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold tracking-wide" style={{ color: c.fgMuted }}>第 {attemptIndex + 1} 题 · {item.question.direction === "en2zh" ? "英译汉" : "汉译英"}</p><span className="text-sm font-semibold" style={{ color: item.evaluation.verdict === "acceptable" ? c.success : c.danger }}>{item.evaluation.score} 分 · {item.evaluation.verdict === "acceptable" ? "可接受" : "需改进"}</span></div><p className="mt-3 text-base leading-relaxed" style={{ color: c.fg }}>{item.question.direction === "en2zh" ? item.question.sentence.en : item.question.sentence.zh}</p><p className="mt-3 text-sm" style={{ color: c.fgSub }}>你的译文：{item.answer}</p><p className="mt-2 text-sm leading-relaxed" style={{ color: c.fgMuted }}>{item.evaluation.feedback}</p><div className="mt-3 flex flex-wrap gap-2">{item.evaluation.acceptedTranslations.map((translation) => <span key={translation} className="rounded-md px-2 py-1 text-xs" style={{ background: `${c.accent}14`, color: c.accent }}>{translation}</span>)}</div>{item.evaluation.issues.map((issue, issueIndex) => <p key={issueIndex} className="mt-3 border-l-2 pl-3 text-xs leading-relaxed" style={{ borderColor: c.danger, color: c.fgSub }}><b style={{ color: c.danger }}>{labels[issue.category]}：</b>{issue.explanation} 建议：{issue.suggestion}</p>)}</div>)}</div></div></Card>;
}

function ReportHistory({ c }: { c: ThemeColors }) {
  const [historyTab, setHistoryTab] = useState<"translation" | "reading" | "writing" | "listening">("translation");
  const tabs = [{ id: "translation", label: "翻译报告" }, { id: "reading", label: "阅读记录" }, { id: "writing", label: "写作记录" }, { id: "listening", label: "听力记录" }] as const;
  const translationReports = loadReports();
  const totalGroups = translationReports.length + loadReadingReports().length + loadWritingReports().length + loadListeningReports().length;
  const recent7Days = translationReports.filter((r) => Date.now() - r.createdAt <= 7 * 86400_000);
  const recentAttempts = recent7Days.flatMap((r) => r.attempts);
  const avgRate = recentAttempts.length > 0
    ? Math.round((recentAttempts.filter((a) => a.evaluation.verdict === "acceptable").length / recentAttempts.length) * 100)
    : 0;
  const chunksCount = loadUserChunks().length;

  return <div className="container-focus space-y-5 pb-8 zen-page-enter">
    <EnglishPageHeader
      c={c}
      eyebrow="LEARNING REPORTS"
      title="历史报告"
      description="按模块归档每次练习的得分、AI 解析与详细记录。"
    >
      <EnglishSegmentedTabs tabs={[...tabs]} value={historyTab} onChange={(value) => setHistoryTab(value as typeof historyTab)} ariaLabel="历史报告类型" c={c} />
    </EnglishPageHeader>

    {/* Minimal 3-metric Summary Bar */}
    <div className="grid grid-cols-3 gap-3">
      <Card c={c} className="px-4 py-3">
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>累计练习组数</p>
        <p className="type-title zen-tnum mt-0.5" style={{ color: "var(--text-primary)" }}>{totalGroups} 组</p>
      </Card>
      <Card c={c} className="px-4 py-3">
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>近 7 天正确率</p>
        <p className="type-title zen-tnum mt-0.5" style={{ color: "var(--accent-primary)" }}>{avgRate}%</p>
      </Card>
      <Card c={c} className="px-4 py-3">
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>个人语块库</p>
        <p className="type-title zen-tnum mt-0.5" style={{ color: "var(--text-primary)" }}>{chunksCount} 条</p>
      </Card>
    </div>

    {historyTab === "translation" ? <TranslationReportHistory c={c} /> : historyTab === "reading" ? <ReadingReportHistory c={c} /> : historyTab === "writing" ? <WritingReportHistory c={c} /> : <ListeningReportHistory c={c} />}
  </div>;
}

function ListeningReportHistory({ c }: { c: ThemeColors }) {
  const reports = loadListeningReports();
  const [page, setPage] = useState(0);
  const [selectedAt, setSelectedAt] = useState<number | null>(null);
  const selected = reports.find((report) => report.completedAt === selectedAt);
  if (selected) return <Card c={c}><div className="p-6 md:p-8"><HistoryDetailHeader title={formatListeningReportTitle(selected)} subtitle={new Date(selected.completedAt).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" })} onBack={() => setSelectedAt(null)} c={c} /><div className="mt-5 space-y-5"><section><p className="text-xs font-semibold tracking-wide" style={{ color: c.fgMuted }}>我的默写</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed" style={{ color: c.fg }}>{selected.draft}</p></section><section className="rounded-xl p-4" style={{ background: c.inputBg }}><p className="text-xs font-semibold tracking-wide" style={{ color: c.fgMuted }}>标准原文</p><p className="mt-2 text-sm leading-relaxed" style={{ color: c.fgSub }}>{selected.evaluation.transcript}</p></section></div></div></Card>;
  const visibleReports = reports.slice(page * HISTORY_PAGE_SIZE, (page + 1) * HISTORY_PAGE_SIZE);
  return <Card c={c}><div className="p-6 md:p-8"><h2 className="text-base font-semibold" style={{ color: c.fg }}>听力记录</h2><p className="mt-1 text-sm" style={{ color: c.fgMuted }}>分页保存每次听力默写，可单独查看标准原文和评分。</p>{reports.length === 0 ? <p className="py-10 text-center text-sm" style={{ color: c.fgMuted }}>完成一组听力练习后，这里会留下评分记录。</p> : <><div className="mt-5 space-y-3">{visibleReports.map((report) => <button type="button" key={report.completedAt} onClick={() => setSelectedAt(report.completedAt)} className="flex w-full items-center justify-between gap-3 rounded-xl p-4 text-left" style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}><div><p className="font-semibold" style={{ color: c.fg }}>{formatListeningReportTitle(report)}</p><p className="mt-1 text-xs" style={{ color: c.fgMuted }}>{new Date(report.completedAt).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" })}</p></div><span className="text-sm" style={{ color: c.accent }}>查看详情</span></button>)}</div><div className="mt-5"><HistoryPager page={page} total={reports.length} onChange={setPage} c={c} /></div></>}</div></Card>;
}

function WritingReportHistory({ c }: { c: ThemeColors }) {
  const reports = loadWritingReports();
  const [page, setPage] = useState(0);
  const [selectedAt, setSelectedAt] = useState<number | null>(null);
  const selected = reports.find((report) => report.completedAt === selectedAt);
  if (selected) return <WritingReportDetail report={selected} onBack={() => setSelectedAt(null)} c={c} />;
  const visibleReports = reports.slice(page * HISTORY_PAGE_SIZE, (page + 1) * HISTORY_PAGE_SIZE);
  return <Card c={c}><div className="p-6 md:p-8"><h2 className="text-base font-semibold" style={{ color: c.fg }}>写作记录</h2><p className="mt-1 text-sm" style={{ color: c.fgMuted }}>每次完成一篇作文都会归档，分页浏览后可进入独立详情。</p>{reports.length === 0 ? <p className="py-10 text-center text-sm" style={{ color: c.fgMuted }}>完成一组写作练习后，这里会留下评分记录。</p> : <><div className="mt-5 space-y-3">{visibleReports.map((report) => <button type="button" key={`${report.topic.id}-${report.completedAt}`} onClick={() => setSelectedAt(report.completedAt)} className="flex w-full items-center justify-between gap-3 rounded-xl p-4 text-left" style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}><div><p className="text-sm font-semibold" style={{ color: c.fg }}>{formatWritingReportTitle(report)}</p><p className="mt-1 text-xs" style={{ color: c.fgMuted }}>{new Date(report.completedAt).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" })}</p></div><span className="text-sm" style={{ color: c.accent }}>查看详情</span></button>)}</div><div className="mt-5"><HistoryPager page={page} total={reports.length} onChange={setPage} c={c} /></div></>}</div></Card>;
}

function WritingReportDetail({ report, onBack, c }: { report: WritingReport; onBack: () => void; c: ThemeColors }) {
  const scores: Array<[string, number]> = [["内容", report.evaluation.scores.content], ["语法", report.evaluation.scores.grammar], ["词汇", report.evaluation.scores.vocabulary], ["结构", report.evaluation.scores.structure]];
  return <Card c={c}><div className="p-6 md:p-8"><HistoryDetailHeader title={formatWritingReportTitle(report)} subtitle={new Date(report.completedAt).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" })} onBack={onBack} c={c} /><div className="mt-5 space-y-5"><section><p className="text-xs font-semibold tracking-wide" style={{ color: c.fgMuted }}>写作任务</p><p className="mt-2 text-sm leading-relaxed" style={{ color: c.fgSub }}>{report.topic.prompt}</p></section><section><p className="text-xs font-semibold tracking-wide" style={{ color: c.fgMuted }}>我的作文</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed" style={{ color: c.fg }}>{report.draft}</p></section><section><p className="text-xs font-semibold tracking-wide" style={{ color: c.fgMuted }}>四项评分</p><div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">{scores.map(([label, score]) => <div key={label} className="rounded-xl px-3 py-2" style={{ background: c.inputBg }}><p className="text-xs" style={{ color: c.fgMuted }}>{label}</p><p className="mt-1 text-base font-semibold tabular-nums" style={{ color: c.fg }}>{score}/25</p></div>)}</div></section><section><p className="text-xs font-semibold tracking-wide" style={{ color: c.fgMuted }}>AI 解析</p><p className="mt-2 text-sm leading-relaxed" style={{ color: c.fgSub }}>{report.evaluation.feedback}</p>{report.evaluation.improvements.length > 0 && <p className="mt-2 text-xs leading-relaxed" style={{ color: c.fgMuted }}>建议：{report.evaluation.improvements.join("；")}</p>}</section><section className="rounded-xl p-4" style={{ background: c.inputBg }}><p className="text-xs font-semibold tracking-wide" style={{ color: c.fgMuted }}>参考润色稿</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed" style={{ color: c.fg }}>{report.evaluation.revisedWriting}</p></section></div></div></Card>;
}

function ReadingReportHistory({ c }: { c: ThemeColors }) {
  const reports = loadReadingReports();
  const [page, setPage] = useState(0);
  const [selectedAt, setSelectedAt] = useState<number | null>(null);
  const selected = reports.find((report) => report.completedAt === selectedAt);
  if (selected) return <ReadingReportDetail report={selected} onBack={() => setSelectedAt(null)} c={c} />;
  const visibleReports = reports.slice(page * HISTORY_PAGE_SIZE, (page + 1) * HISTORY_PAGE_SIZE);
  return <Card c={c}><div className="p-6 md:p-8"><h2 className="text-base font-semibold" style={{ color: c.fg }}>阅读记录</h2><p className="mt-1 text-sm" style={{ color: c.fgMuted }}>每页展示 5 篇阅读记录，详情单独打开，不占用列表空间。</p>{reports.length === 0 ? <p className="py-10 text-center text-sm" style={{ color: c.fgMuted }}>完成一篇阅读文章后，这里会留下本组记录。</p> : <><div className="mt-5 space-y-3">{visibleReports.map((report) => <button type="button" key={`${report.article.id}-${report.completedAt}`} onClick={() => setSelectedAt(report.completedAt)} className="flex w-full items-center justify-between gap-4 rounded-xl p-4 text-left" style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}><div><p className="text-sm font-semibold" style={{ color: c.fg }}>{report.article.title}</p><p className="mt-1 text-xs" style={{ color: c.fgMuted }}>{new Date(report.completedAt).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" })} · {report.annotations.length} 条释义</p></div><div className="flex items-center gap-3">{report.summaryEvaluation && <span className="text-sm font-semibold tabular-nums" style={{ color: c.accent }}>{report.summaryEvaluation.score} 分</span>}<span className="text-sm" style={{ color: c.accent }}>查看详情</span></div></button>)}</div><div className="mt-5"><HistoryPager page={page} total={reports.length} onChange={setPage} c={c} /></div></>}</div></Card>;
}

function ReadingReportDetail({ report, onBack, c }: { report: ReturnType<typeof loadReadingReports>[number]; onBack: () => void; c: ThemeColors }) {
  return <Card c={c}><div className="p-6 md:p-8"><HistoryDetailHeader title={report.article.title} subtitle={`${new Date(report.completedAt).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" })} · ${report.annotations.length} 条释义`} onBack={onBack} c={c} /><div className="mt-5 space-y-5"><section><p className="text-xs font-semibold tracking-wide" style={{ color: c.fgMuted }}>原文</p><p className="mt-2 type-english whitespace-pre-line" style={{ color: c.fg }}>{report.article.content}</p></section><section><p className="text-xs font-semibold tracking-wide" style={{ color: c.fgMuted }}>我的概述</p><p className="mt-2 whitespace-pre-line text-sm leading-relaxed" style={{ color: report.summary ? c.fgSub : c.fgMuted }}>{report.summary || "未填写概述"}</p>{report.summaryEvaluation && <div className="mt-3 rounded-xl p-3" style={{ background: c.inputBg }}><p className="text-sm font-semibold" style={{ color: c.accent }}>AI 评分：{report.summaryEvaluation.score} 分</p><p className="mt-2 text-sm leading-relaxed" style={{ color: c.fgSub }}>{report.summaryEvaluation.feedback}</p>{report.summaryEvaluation.improvements.length > 0 && <p className="mt-2 text-xs leading-relaxed" style={{ color: c.fgMuted }}>建议：{report.summaryEvaluation.improvements.join("；")}</p>}</div>}</section><section><p className="text-xs font-semibold tracking-wide" style={{ color: c.fgMuted }}>行间释义</p>{report.annotations.length === 0 ? <p className="mt-2 text-sm" style={{ color: c.fgMuted }}>本组没有添加释义。</p> : <div className="mt-3 flex flex-wrap gap-2">{report.annotations.map((annotation) => <span key={`${annotation.lineId}-${annotation.selectedText}-${annotation.createdAt}`} className="rounded-lg px-3 py-2 text-sm" style={{ background: c.inputBg, color: c.fgSub }}><b style={{ color: c.accent }}>{annotation.selectedText}</b> · {annotation.translation}</span>)}</div>}</section></div></div></Card>;
}

