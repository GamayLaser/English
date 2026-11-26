import { useEffect, useRef, useState } from "react";
import { EnglishButton, EnglishPageHeader } from "../components/english/EnglishUi";
import { loadAiSettings } from "../features/english/aiSettings";
import { startStreamingReadingAudio } from "../features/reading/elevenLabsTts";
import { evaluateListening } from "../features/listening/listeningEvaluator";
import { loadListeningLibrary } from "../features/listening/listeningLibrary";
import {
  completeListeningGroup,
  loadLastListeningArticle,
  loadListeningProgress,
  saveLastListeningArticle,
  saveListeningDraft,
  saveListeningEvaluation,
} from "../features/listening/listeningProgress";
import type { ThemeColors } from "../types";
import Card from "../components/ui/Card";
import type { WorkspaceUpdate } from "../features/persistence/workspaceUpdateRouting";

export const countDictationWords = (value: string) =>
  value.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length ?? 0;

export default function ListeningPractice({ c, workspaceUpdate = null }: { c: ThemeColors; workspaceUpdate?: WorkspaceUpdate | null }) {
  const [articles, setArticles] = useState(loadListeningLibrary);
  const [id, setId] = useState(() => loadLastListeningArticle() ?? articles[0]?.id ?? "");
  const article = articles.find((item) => item.id === id) ?? articles[0];
  const [progress, setProgress] = useState(() =>
    article ? loadListeningProgress(article.id) : { draft: "", lastOpenedAt: 0 },
  );
  const [busy, setBusy] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [instantChecked, setInstantChecked] = useState(false);
  const [message, setMessage] = useState("");
  const player = useRef<HTMLAudioElement | null>(null);
  const audioStopRef = useRef<(() => void) | null>(null);
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const lastWorkspaceRevision = useRef(0);

  useEffect(() => {
    if (!workspaceUpdate || lastWorkspaceRevision.current === workspaceUpdate.revision) return;
    lastWorkspaceRevision.current = workspaceUpdate.revision;
    if (workspaceUpdate.keys.includes("english:listening-library-v2")) setArticles(loadListeningLibrary());
    if (article && workspaceUpdate.keys.includes("english:listening-progress-v2")) setProgress(loadListeningProgress(article.id));
  }, [workspaceUpdate?.revision, article?.id]);

  useEffect(() => {
    if (!article) return;
    saveLastListeningArticle(article.id);
    setProgress(loadListeningProgress(article.id));
    setReady(false);
    setPlaying(false);
    setShowTranscript(false);
    setInstantChecked(false);
    setMessage("");
    audioStopRef.current?.();
    audioStopRef.current = null;
    player.current?.pause();
    player.current = null;
  }, [article?.id]);

  if (!article) return null;

  const referenceWords: string[] =
    article.content.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*[.,!?;:]?/g) ?? [];
  const count = referenceWords.length;
  const words = progress.draft.includes("\u001f") ? progress.draft.split("\u001f") : (progress.draft.trim() ? progress.draft.trim().split(/\s+/) : []);

  const save = (nextWords: string[]) => {
    setProgress(saveListeningDraft(article.id, nextWords.join("\u001f")));
    setMessage("");
  };

  const change = (index: number, value: string) => {
    const nextWords = Array.from({ length: count }, (_, wordIndex) => words[wordIndex] ?? "");
    const addedWords = value.trim().split(/\s+/).filter(Boolean);
    nextWords[index] = addedWords[0] ?? "";
    addedWords.slice(1).forEach((word, offset) => { if (index + offset + 1 < count) nextWords[index + offset + 1] = word; });
    save(nextWords.slice(0, count));
    if (addedWords.length > 1) window.setTimeout(() => refs.current[Math.min(index + addedWords.length, count - 1)]?.focus(), 0);
  };

  const stop = () => {
    const audio = player.current;
    if (!audio) return;
    audioStopRef.current?.();
    audioStopRef.current = null;
    audio.pause();
    audio.currentTime = 0;
    setPlaying(false);
  };

  async function play() {
    if (player.current) {
      try {
        await player.current.play();
        setPlaying(true);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "音频播放失败，请重试。");
      }
      return;
    }
    setAudioBusy(true);
    setMessage("");
    try {
      const session = await startStreamingReadingAudio({ text: article.content });
      const audio = session.player;
      audio.onended = () => {
        audioStopRef.current = null;
        setPlaying(false);
      };
      audio.onerror = () => setMessage("音频暂时无法播放，请重试。");
      player.current = audio;
      audioStopRef.current = session.stop;
      void session.finished.catch((error: unknown) => {
        if (player.current !== audio) return;
        setMessage(error instanceof Error ? error.message : "音频传输中断，请重试。");
      });
      setReady(true);
      setPlaying(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "音频生成失败，请重试。");
    } finally {
      setAudioBusy(false);
    }
  }

  async function score() {
    if (!progress.draft.trim()) {
      setMessage("请先完成默写后再提交评分。");
      return;
    }

    const settings = loadAiSettings();
    if (!settings) {
      setMessage("请先在设置中保存 DeepSeek API Key。");
      return;
    }

    setBusy(true);
    try {
      setProgress(
        saveListeningEvaluation(
          article.id,
          await evaluateListening({ settings, article, dictation: words.filter(Boolean).join(" ") }),
        ),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "评分失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

function AudioVisualizerBars({ active, color }: { active: boolean; color: string }) {
  const barHeights = [40, 75, 55, 90, 60, 85, 45, 95, 65, 80, 50, 70];
  return (
    <div className="flex items-center gap-1 h-7 px-2 shrink-0" aria-hidden="true">
      {barHeights.map((h, i) => (
        <span
          key={i}
          className="w-1 rounded-full transition-all duration-300"
          style={{
            background: color,
            height: active ? `${h}%` : "18%",
            animation: active ? `pulse ${(i % 4) * 0.18 + 0.5}s ease-in-out infinite alternate` : "none",
            animationDelay: `${i * 0.06}s`,
            opacity: active ? 0.9 : 0.28,
          }}
        />
      ))}
    </div>
  );
}

  return (
    <div className="flex flex-col gap-5 pb-8 zen-page-enter">
      <EnglishPageHeader
        c={c}
        eyebrow="LISTENING DICTATION"
        title={article.title}
        description="听原声逐词默写，输入空格自动跳转下一格，提交后由 AI 逐词比对评分。"
        aside={
          <>
            <AudioVisualizerBars active={playing} color={c.accent} />
            {articles.length > 1 && (
              <select
                value={article.id}
                onChange={(e) => setId(e.target.value)}
                className="min-h-9 rounded-xl border px-3 py-1.5 text-[13px] font-medium outline-none max-w-[200px]"
                style={{ background: c.inputBg, borderColor: c.inputBorder, color: c.fg }}
                aria-label="选择听力原文"
              >
                {articles.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            )}
            <EnglishButton
              variant={playing ? "danger" : "primary"}
              c={c}
              disabled={audioBusy}
              onClick={() => (playing ? stop() : void play())}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {playing ? (
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                ) : (
                  <polygon points="6 4 20 12 6 20 6 4" />
                )}
              </svg>
              {audioBusy ? "正在准备…" : playing ? "停止播放" : ready ? "播放原声" : "准备并播放"}
            </EnglishButton>
          </>
        }
      />

      <Card c={c} className="p-5 md:p-8">
        <div className="flex justify-between gap-5">
          <div>
            <h3 className="font-semibold" style={{ color: c.fg }}>
              你的默写
            </h3>
            <p className="mt-1.5 text-sm" style={{ color: c.fgMuted }}>
              每个下划线填写一个单词；输入空格会自动跳到下一格。
            </p>
          </div>
          <span className="shrink-0 self-start rounded-xl px-3 py-1.5 text-[13px] font-semibold tabular-nums" style={{ background: c.inputBg, color: c.fgMuted }}>
            {countDictationWords(progress.draft)} / {count} 词
          </span>
        </div>

        <div
          className="flex flex-wrap gap-x-5 gap-y-7"
          style={{ marginTop: "2rem" }}
        >
          {referenceWords.map((reference, index) => {
            const standardWord = reference.replace(/[.,!?;:]/g, "");
            const currentWord = showTranscript ? standardWord : words[index] ?? "";
            const wordLength = Math.max(3, standardWord.length, currentWord.length + 0.4);
            const punctuation = reference.match(/[.,!?;:]+$/)?.[0];
            const isMatched = currentWord.trim().toLowerCase() === standardWord.toLowerCase();
            const underlineColor = instantChecked
              ? isMatched
                ? c.success
                : c.danger
              : c.accent;

            return (
              <span
                key={index}
                className="inline-flex items-end gap-2"
                style={{ marginRight: "0.65rem", marginBottom: "0.2rem" }}
              >
                <input
                  ref={(node) => {
                    refs.current[index] = node;
                  }}
                  value={currentWord}
                  readOnly={showTranscript}
                  onChange={(event) => {
                    setInstantChecked(false);
                    change(index, event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === " ") {
                      event.preventDefault();
                      refs.current[index + 1]?.focus();
                    }
                  }}
            className="bg-transparent px-2 pb-1.5 type-english text-center outline-none"
                  style={{
                    width: `${wordLength}ch`,
                    boxSizing: "content-box",
                    border: "none",
                    backgroundImage: `linear-gradient(90deg, ${underlineColor}, ${instantChecked ? underlineColor : c.fgMuted})`,
                    backgroundPosition: "left bottom",
                    backgroundRepeat: "no-repeat",
                    backgroundSize: "100% 2px",
                    color: instantChecked ? (isMatched ? c.success : c.danger) : c.fg,
                                      }}
                  aria-label={`第 ${index + 1} 个默写单词`}
                />
                <span className="pb-1 text-base" style={{ color: c.fg }}>
                  {punctuation}
                </span>
              </span>
            );
          })}
        </div>

        {message && (
          <p className="mt-5 text-sm" style={{ color: c.danger }}>
            {message}
          </p>
        )}

        {instantChecked && (
          <div
            className="mt-5 rounded-xl px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-2"
            style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}
          >
            <span style={{ color: c.fg }}>
              即时拼写核对：正确{" "}
              <b style={{ color: c.success }}>
                {referenceWords.filter((ref, idx) => (words[idx] ?? "").trim().toLowerCase() === ref.replace(/[.,!?;:]/g, "").toLowerCase()).length}
              </b>{" "}
              / {count} 词（标绿正确，标红可对照原文修改）
            </span>
          </div>
        )}

        <div className="mt-7 flex flex-wrap items-center justify-end gap-3">
          <EnglishButton
            variant="secondary"
            c={c}
            onClick={() => setInstantChecked((v) => !v)}
          >
            {instantChecked ? "隐藏拼写核对" : "即时核对拼写"}
          </EnglishButton>
          <EnglishButton
            variant="secondary"
            c={c}
            onClick={() => setShowTranscript((value) => !value)}
          >
            {showTranscript ? "隐藏原文" : "显示原文"}
          </EnglishButton>
          <EnglishButton variant="primary" c={c} disabled={busy} onClick={() => void score()}>
            {busy ? "AI 正在解析…" : "AI 深度解析与评分"}
          </EnglishButton>
        </div>

        {progress.evaluation && (
          <section className="mt-6 border-t pt-6" style={{ borderColor: c.borderSub }}>
            <div className="flex justify-between">
              <h3 style={{ color: c.fg }}>AI 听力解析</h3>
              <b style={{ color: c.accent }}>{progress.evaluation.totalScore} 分</b>
            </div>
            <p className="mt-4 text-sm" style={{ color: c.fgSub }}>
              {progress.evaluation.feedback}
            </p>
            <h4 className="mt-5 text-sm font-semibold" style={{ color: c.fg }}>
              标准原文
            </h4>
            <p className="mt-2 leading-relaxed" style={{ color: c.fg }}>
              {progress.evaluation.transcript}
            </p>
            <div className="mt-5 flex justify-end">
              <EnglishButton
                variant="primary"
                c={c}
                onClick={() => {
                  const nextArticleId = completeListeningGroup({
                    articles,
                    article,
                    progress: { ...progress, draft: words.filter(Boolean).join(" ") },
                    completedAt: Date.now(),
                  }).nextArticleId;
                  if (nextArticleId) setId(nextArticleId);
                }}
              >
                完成本组并进入下一组
              </EnglishButton>
            </div>
          </section>
        )}
      </Card>
    </div>
  );
}

