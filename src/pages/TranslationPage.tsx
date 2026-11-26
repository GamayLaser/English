import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { AutoAdvance, DiffFeedbackCard, PracticeCompletedCard } from "../components/english/DiffFeedbackCard";
import { EnglishPageHeader, EnglishSegmentedTabs } from "../components/english/EnglishUi";
import { ERROR_LABELS } from "../components/english/RadarScoreCard";
import { Button } from "../components/ui";
import { loadUserChunks } from "../features/chunks/chunksStore";
import { loadAiSettings } from "../features/english/aiSettings";
import { evaluateTranslation } from "../features/english/deepseekEvaluator";
import { recordSentenceAttempt } from "../features/english/learningStats";
import { AUTO_ADVANCE_MS, shouldAutoAdvance, shouldFocusAnswerInput } from "../features/english/practiceFlow";
import { createPracticeSet, type PracticeDirectionMode } from "../features/english/practiceScheduler";
import { loadSentenceLibrary } from "../features/english/sentenceLibrary";
import {
  clearTranslationPracticeSession,
  loadReports,
  loadSchedulerHistory,
  loadTranslationPracticeSession,
  loadWrongBook,
  saveReports,
  saveSchedulerHistory,
  saveTranslationPracticeSession,
  upsertWrongBookItem,
  type TranslationPracticeSession,
} from "../features/english/storage";
import type { Evaluation, PracticeQuestion } from "../features/english/types";
import type { ThemeColors } from "../types";

export type PracticeSourceFilter = "smart" | "chunks" | "builtin";

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
  saveSchedulerHistory({
    groupsCreated: history.groupsCreated + 1,
    reviewsAssigned: history.reviewsAssigned + questions.filter((item) => item.kind === "review").length,
  });
  return questions;
}

function createSession(directionMode: PracticeDirectionMode = "zh2en", sourceFilter: PracticeSourceFilter = "smart"): TranslationPracticeSession {
  return { questions: createGroup(directionMode, sourceFilter), index: 0, answer: "", attempts: [], evaluation: null };
}

function loadOrCreateSession(): TranslationPracticeSession {
  const session = loadTranslationPracticeSession();
  if (session && session.questions.length > 0 && session.index < session.questions.length) return session;
  clearTranslationPracticeSession();
  return createSession();
}

export default function TranslationPage({ c }: { c: ThemeColors }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const wrongIdParam = searchParams.get("wrongId");
  const [practice, setPractice] = useState<TranslationPracticeSession>(loadOrCreateSession);
  const { questions, index, answer, evaluation, attempts } = practice;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [finished, setFinished] = useState(false);
  const [directionMode, setDirectionMode] = useState<PracticeDirectionMode>("zh2en");
  const [sourceFilter, setSourceFilter] = useState<PracticeSourceFilter>("smart");
  const [micActive, setMicActive] = useState(false);
  const answerInputRef = useRef<HTMLTextAreaElement>(null);
  const micRef = useRef<{ stop: () => void } | null>(null);
  const current = questions[index];

  function stopMic() {
    if (micRef.current) {
      try {
        micRef.current.stop();
      } catch {}
      micRef.current = null;
    }
    setMicActive(false);
  }

  useEffect(() => () => stopMic(), []);

  useEffect(() => {
    if (!wrongIdParam) return;
    const wrongItem = loadWrongBook().find((item) => item.sentence.id === wrongIdParam);
    if (wrongItem) {
      const targetQuestion: PracticeQuestion = {
        sentence: wrongItem.sentence,
        kind: "review",
        direction: "zh2en",
        previousIssues: wrongItem.latestAttempt?.evaluation.issues ?? [],
      };
      const base = createGroup("zh2en", "smart").filter((q) => q.sentence.id !== wrongIdParam);
      replacePractice({
        questions: [targetQuestion, ...base],
        index: 0,
        answer: "",
        attempts: [],
        evaluation: null,
      });
      setFinished(false);
      setMessage("");
    }
    setSearchParams({}, { replace: true });
  }, [wrongIdParam]);

  const hasSpeech =
    typeof window !== "undefined" &&
    Boolean((window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition);

  function replacePractice(next: TranslationPracticeSession) {
    setPractice(next);
    saveTranslationPracticeSession(next);
  }

  const accepted = attempts.filter((item) => item.evaluation.verdict === "acceptable").length;
  const tags = useMemo(
    () =>
      attempts
        .flatMap((item) => item.evaluation.errorTags)
        .reduce<Record<string, number>>((all, tag) => ({ ...all, [tag]: (all[tag] ?? 0) + 1 }), {}),
    [attempts],
  );

  async function submit() {
    if (!current) return;
    const settings = loadAiSettings();
    if (!answer.trim()) {
      setMessage("请输入翻译后再提交。");
      return;
    }
    stopMic();
    setBusy(true);
    setMessage("");
    try {
      const result: Evaluation = await evaluateTranslation({ settings, question: current, answer });
      const attempt = { question: current, answer, evaluation: result, completedAt: Date.now() };
      replacePractice({ ...practice, attempts: [...attempts, attempt], evaluation: result });
      recordSentenceAttempt(current.sentence.id, result.score, attempt.completedAt);
      const isChunkItem = current.sentence.id.startsWith("chunk:");
      if (result.verdict === "needs_improvement" || (current.kind === "review" && !isChunkItem)) {
        upsertWrongBookItem(attempt);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "模型请求失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  function next() {
    stopMic();
    if (index === questions.length - 1) {
      saveReports([{ date: new Date().toLocaleDateString("zh-CN"), attempts, createdAt: Date.now() }, ...loadReports()]);
      clearTranslationPracticeSession();
      setFinished(true);
      return;
    }
    replacePractice({ ...practice, index: index + 1, answer: "", evaluation: null });
    setMessage("");
  }

  function restart(nextDir = directionMode, nextSource = sourceFilter) {
    stopMic();
    replacePractice(createSession(nextDir, nextSource));
    setFinished(false);
    setMessage("");
  }

  useEffect(() => {
    if (!evaluation || !shouldAutoAdvance(evaluation.verdict)) return;
    const timer = window.setTimeout(next, AUTO_ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [evaluation, index]);

  useEffect(() => {
    if (!shouldFocusAnswerInput({ view: "practice", hasEvaluation: Boolean(evaluation), finished })) return;
    const frame = window.requestAnimationFrame(() => answerInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [index, evaluation, finished]);

  function toggleVoiceAnswer() {
    if (micActive) {
      micRef.current?.stop();
      setMicActive(false);
      return;
    }
    const w = window as unknown as Record<string, unknown>;
    const Ctor = (w.SpeechRecognition || w.webkitSpeechRecognition) as
      | (new () => {
          lang: string;
          interimResults: boolean;
          onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
          onerror: (() => void) | null;
          onend: (() => void) | null;
          start: () => void;
          stop: () => void;
        })
      | undefined;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = current.direction === "zh2en" ? "en-US" : "zh-CN";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const text = e.results?.[0]?.[0]?.transcript?.trim();
      if (text) replacePractice({ ...practice, answer: answer ? `${answer} ${text}` : text });
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
    void submit();
  }

  if (finished) {
    return (
      <div className="container-focus pb-8">
        <PracticeCompletedCard
          c={c}
          total={questions.length}
          accepted={accepted}
          tags={tags}
          attempts={attempts}
          onRestart={() => restart()}
          onWrongBook={() => navigate("/wrongbook")}
        />
      </div>
    );
  }

  const prompt = current.direction === "en2zh" ? current.sentence.en : current.sentence.zh;

  return (
    <div className="container-focus space-y-5 pb-8 zen-page-enter">
      <EnglishPageHeader
        c={c}
        eyebrow="TRANSLATION PRACTICE"
        title="句子翻译 · 口译输出"
        description="默认以汉译英为主，支持语音口译输入与 AI 5 维精批。"
        aside={
          <div className="flex items-center gap-3 rounded-xl px-3.5 py-2" style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}>
            <span className="type-title zen-tnum" style={{ color: c.fg }}>{String(index + 1).padStart(2, "0")}</span>
            <span className="text-xs zen-tnum" style={{ color: c.fgMuted }}>/ {String(questions.length).padStart(2, "0")}</span>
            <div className="h-1.5 w-20 overflow-hidden rounded-full" style={{ background: c.card }}>
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${((index + 1) / questions.length) * 100}%`, background: c.accent }} />
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
            onChange={(v) => {
              const m = v as PracticeDirectionMode;
              setDirectionMode(m);
              restart(m, sourceFilter);
            }}
            ariaLabel="翻译方向模式"
            c={c}
          />
          <select
            value={sourceFilter}
            onChange={(e) => {
              const s = e.target.value as PracticeSourceFilter;
              setSourceFilter(s);
              restart(directionMode, s);
            }}
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
          <span className="text-xs font-semibold tracking-[0.14em]" style={{ color: c.accent }}>
            {current.direction === "en2zh" ? "ENGLISH → CHINESE" : "CHINESE → ENGLISH"}
          </span>
          {current.kind === "review" && (
            <span className="rounded-md px-2 py-0.5 text-xs font-medium" style={{ background: c.accentDim, color: c.accent }}>
              复习题
            </span>
          )}
        </div>

        {current.kind === "review" && current.previousIssues.length > 0 && (
          <p className="rounded-xl px-4 py-2.5 text-sm" style={{ background: c.inputBg, color: c.fgMuted, border: `1px solid ${c.borderSub}` }}>
            上次薄弱点：{current.previousIssues.map((item) => ERROR_LABELS[item.category]).join("、")}
          </p>
        )}

        <div
          data-testid="translation-prompt"
          className="relative overflow-hidden rounded-2xl border px-5 py-7 text-center md:px-10 md:py-10"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border-subtle)" }}
        >
          <p data-testid="translation-prompt-text" className="mx-auto w-full break-words type-prompt" style={{ color: c.fg }}>
            {prompt}
          </p>
        </div>

        {!evaluation ? (
          <>
            <div className="w-full rounded-2xl border p-4 md:p-6 zen-card" style={{ borderColor: "var(--border-subtle)" }}>
              <label htmlFor="translation-answer" className="mb-2.5 block text-sm font-semibold" style={{ color: c.fg }}>
                你的译文
              </label>
              <textarea
                id="translation-answer"
                data-testid="translation-answer"
                aria-label="你的翻译"
                rows={3}
                ref={answerInputRef}
                value={answer}
                onChange={(event) => replacePractice({ ...practice, answer: event.target.value })}
                onKeyDown={onAnswerKeyDown}
                placeholder="在这里输入你的译文，或点击下方语音口译输入…"
                className="w-full resize-y rounded-xl border px-4 py-3 text-base leading-7 outline-none transition focus:border-[var(--accent-primary)] focus:ring-4 focus:ring-[var(--accent-primary)]/15 md:min-h-32"
                style={{ background: c.inputBg, borderColor: c.inputBorder, color: c.fg, caretColor: c.accent }}
              />
              <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                {hasSpeech && (
                  <Button type="button" variant={micActive ? "danger" : "secondary"} c={c} onClick={toggleVoiceAnswer}>
                    {micActive ? "停止口译录音" : "语音口译输入"}
                  </Button>
                )}
                <Button type="button" variant="primary" c={c} aria-label="提交翻译" disabled={busy || !answer.trim()} onClick={() => void submit()} className="w-full sm:w-auto">
                  {busy ? "正在提交…" : "提交译文"}
                </Button>
              </div>
            </div>
            {message && <p className="text-sm" style={{ color: c.danger }}>{message}</p>}
          </>
        ) : (
          <>
            <DiffFeedbackCard c={c} answer={answer} evaluation={evaluation} />
            {shouldAutoAdvance(evaluation.verdict) ? (
              <AutoAdvance c={c} />
            ) : (
              <Button type="button" variant="primary" c={c} className="self-center" onClick={next}>
                {index === questions.length - 1 ? "完成练习" : "下一题"}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
