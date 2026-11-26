import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { EnglishPageHeader } from "../components/english/EnglishUi";
import { Button, Card, Modal } from "../components/ui";
import { loadReports, loadWrongBook } from "../features/english/storage";
import {
  getDueUserChunks,
  loadUserChunks,
  recordUserChunkReview,
  removeUserChunk,
  toggleUserChunkMastered,
  type UserChunk,
} from "../features/chunks/chunksStore";
import { loadListeningReports } from "../features/listening/listeningProgress";
import { loadReadingReports } from "../features/reading/readingProgress";
import { loadVocabProgress, speakVocabText } from "../features/vocab/vocabStore";
import { loadWritingReports } from "../features/writing/writingProgress";
import { hueDimOf, hueOf } from "../theme/palette";
import type { ThemeColors } from "../types";

const SURVIVAL_PHRASES = [
  {
    en: "Sorry, I didn't catch that.",
    zh: "抱歉，我没听清。",
    tip: "没听懂老外说话时最自然的回应",
  },
  {
    en: "Could you speak a bit slower?",
    zh: "能说慢一点吗？",
    tip: "礼貌请求对方放慢语速",
  },
  {
    en: "What does that mean?",
    zh: "那是什么意思？",
    tip: "遇到生词或听不懂的表达直接问",
  },
  {
    en: "That makes sense.",
    zh: "有道理 / 原来如此。",
    tip: "美剧高频接话词，表示听懂并认同",
  },
  {
    en: "I'm still learning English.",
    zh: "我还在学英语。",
    tip: "开场白神器，老外听完会自动放慢语速",
  },
  {
    en: "Sounds good to me!",
    zh: "听起来不错 / 就这么定了！",
    tip: "日常答应邀约或方案的万能回答",
  },
] as const;

function SpeakerIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

export default function TodayPage({ c }: { c: ThemeColors }) {
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewQueue, setReviewQueue] = useState<UserChunk[]>([]);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const refresh = () => setTick((t) => t + 1);
    window.addEventListener("workspace:stats-updated", refresh);
    return () => window.removeEventListener("workspace:stats-updated", refresh);
  }, []);

  void tick;
  const vocab = loadVocabProgress();
  const chunks = loadUserChunks();
  const dueChunks = getDueUserChunks();
  const wrongPending = loadWrongBook().filter((item) => item.lastVerdict !== "acceptable").length;

  function startChunkReview() {
    const list = dueChunks.length > 0 ? dueChunks : chunks.filter((ch) => !ch.mastered);
    if (!list.length) return;
    setReviewQueue(list.slice(0, 15));
    setReviewIdx(0);
    setRevealed(false);
    setReviewOpen(true);
  }

  const activeReviewChunk = reviewQueue[reviewIdx] ?? null;
  const totalSessions =
    loadReports().length +
    loadReadingReports().length +
    loadListeningReports().length +
    loadWritingReports().length;

  return (
    <div className="space-y-5 pb-8 zen-page-enter">
      <EnglishPageHeader
        c={c}
        eyebrow="TODAY'S PLAN"
        title="今日学习"
        description="围绕「听懂美剧 + 正常口语交流」设计的每日学习路径，按顺序完成今日训练。"
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <Button c={c} variant="secondary" onClick={() => navigate("/wrongbook")}>
              待复习错题 ({wrongPending})
            </Button>
            <Button c={c} variant="primary" onClick={() => navigate("/words")}>
              开始今日词卡
            </Button>
          </div>
        }
      />

      {/* 3-Step Daily Path */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card c={c} hover wash={hueDimOf(c, "blue")} className="p-5 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span
                className="rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wider"
                style={{ background: c.accentDim, color: c.accent }}
              >
                STEP 1 · 词汇反应
              </span>
              <span className="text-xs font-medium zen-tnum" style={{ color: c.fgMuted }}>
                已掌握 {vocab.mastered.size}
              </span>
            </div>
            <h3 className="type-title mt-3" style={{ color: c.fg }}>
              视觉词卡 & 听音辨词
            </h3>
            <p className="type-secondary mt-1.5 min-h-[40px]" style={{ color: c.fgMuted }}>
              插画例句记高频词，配合听音辨词训练条件反射。
            </p>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button c={c} variant="primary" onClick={() => navigate("/words")}>
              进入单词卡
            </Button>
            <Button c={c} variant="secondary" onClick={() => navigate("/phrases")}>
              高频词组
            </Button>
          </div>
        </Card>

        <Card c={c} hover wash={hueDimOf(c, "teal")} className="p-5 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span
                className="rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wider"
                style={{ background: hueDimOf(c, "teal"), color: hueOf(c, "teal") }}
              >
                STEP 2 · 美剧语流
              </span>
              <span className="text-xs font-medium zen-tnum" style={{ color: c.fgMuted }}>
                已收藏 {vocab.bookmarked.size}
              </span>
            </div>
            <h3 className="type-title mt-3" style={{ color: c.fg }}>
              情景对话 & 听力磨耳朵
            </h3>
            <p className="type-secondary mt-1.5 min-h-[40px]" style={{ color: c.fgMuted }}>
              从情景短对话过渡到美剧原声精听与跟读对比。
            </p>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button c={c} variant="primary" onClick={() => navigate("/shows")}>
              美剧精听
            </Button>
            <Button c={c} variant="secondary" onClick={() => navigate("/sentences")}>
              情景句子
            </Button>
          </div>
        </Card>

        <Card c={c} hover wash={hueDimOf(c, "violet")} className="p-5 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span
                className="rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wider"
                style={{ background: hueDimOf(c, "violet"), color: hueOf(c, "violet") }}
              >
                STEP 3 · 输出巩固
              </span>
              <span className="text-xs font-medium zen-tnum" style={{ color: c.fgMuted }}>
                已完成 {totalSessions} 组
              </span>
            </div>
            <h3 className="type-title mt-3" style={{ color: c.fg }}>
              AI 表达批改 & 错题复习
            </h3>
            <p className="type-secondary mt-1.5 min-h-[40px]" style={{ color: c.fgMuted }}>
              通过汉译英与小说复述检验输出，错题自动复习。
            </p>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button c={c} variant="primary" onClick={() => navigate("/practice")}>
              句子翻译
            </Button>
            <Button c={c} variant="secondary" onClick={() => navigate("/reading")}>
              阅读训练
            </Button>
          </div>
        </Card>
      </div>

      {/* Survival Phrases for Adult Beginners */}
      <Card c={c}>
        <div className="p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="type-caption font-semibold tracking-[0.14em] uppercase" style={{ color: c.accent }}>
                SURVIVAL PHRASES
              </p>
              <h3 className="type-title mt-1" style={{ color: c.fg }}>
                零基础交流急救句（点击即听 · 建议跟读）
              </h3>
            </div>
            <Button c={c} variant="ghost" onClick={() => navigate("/sentences")}>
              查看全部情景句 →
            </Button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SURVIVAL_PHRASES.map((phrase) => (
              <button
                key={phrase.en}
                type="button"
                onClick={() => speakVocabText(phrase.en, 0.9)}
                className="group flex flex-col justify-between rounded-xl p-4 text-left transition-all hover:-translate-y-0.5 cursor-pointer"
                style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[15px] font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>
                    {phrase.en}
                  </p>
                  <span
                    className="grid size-7 shrink-0 place-items-center rounded-full transition-colors"
                    style={{ background: c.accentDim, color: c.accent }}
                  >
                    <SpeakerIcon />
                  </span>
                </div>
                <div className="mt-2.5">
                  <p className="text-[13.5px] font-medium" style={{ color: "var(--text-secondary)" }}>
                    {phrase.zh}
                  </p>
                  <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                    {phrase.tip}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Unified Personal Chunks (my_chunks) */}
      <Card c={c}>
        <div className="p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="type-caption font-semibold tracking-[0.14em] uppercase" style={{ color: c.accent }}>
                MY CHUNKS · 个人语块本
              </p>
              <h3 className="type-title mt-1" style={{ color: c.fg }}>
                收藏的地道表达 ({chunks.length}) · 待复习 {dueChunks.length}
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {chunks.filter((ch) => !ch.mastered).length > 0 && (
                <Button c={c} variant="primary" onClick={startChunkReview}>
                  开始语块复习 ({dueChunks.length || chunks.filter((ch) => !ch.mastered).length})
                </Button>
              )}
              <Button c={c} variant="ghost" onClick={() => navigate("/reading")}>
                去读小说收集 →
              </Button>
            </div>
          </div>

          {chunks.length === 0 ? (
            <p className="mt-4 text-sm" style={{ color: c.fgMuted }}>
              还没有收藏语块。去「阅读训练（连载小说）」划词、或在「美剧精听」点台词旁的「收藏」，就会统一汇总到这里复习。
            </p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {chunks.slice(0, 9).map((chunk) => (
                <div
                  key={chunk.id}
                  className="rounded-xl p-4 flex flex-col justify-between gap-3"
                  style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[14.5px] font-semibold leading-snug" style={{ color: c.fg }} lang="en">
                        {chunk.en}
                      </p>
                      <button
                        type="button"
                        onClick={() => speakVocabText(chunk.en, 0.9)}
                        className="grid size-7 shrink-0 place-items-center rounded-full cursor-pointer"
                        style={{ background: c.accentDim, color: c.accent }}
                        aria-label="朗读语块"
                      >
                        <SpeakerIcon />
                      </button>
                    </div>
                    {chunk.zh && (
                      <p className="mt-1.5 text-xs leading-relaxed" style={{ color: c.fgSub }}>
                        {chunk.zh}
                      </p>
                    )}
                    {chunk.context && (
                      <p className="mt-1 text-[11px] truncate" style={{ color: c.fgMuted }}>
                        出处：{chunk.context}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => toggleUserChunkMastered(chunk.id)}
                      className="rounded-lg px-2.5 py-1 text-[11px] font-semibold cursor-pointer"
                      style={{
                        background: chunk.mastered ? c.successDim : c.card,
                        color: chunk.mastered ? c.success : c.fgMuted,
                      }}
                    >
                      {chunk.mastered ? "已掌握 ✓" : "标记掌握"}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeUserChunk(chunk.id)}
                      className="text-[11px] cursor-pointer"
                      style={{ color: c.fgMuted }}
                    >
                      移除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Due Chunks Recall Review Modal */}
      <Modal c={c} open={reviewOpen} onClose={() => setReviewOpen(false)} label="个人语块回译复习" maxWidthClassName="max-w-lg">
        {reviewIdx >= reviewQueue.length ? (
          <div className="py-6 text-center space-y-4">
            <p className="type-caption font-semibold tracking-[0.14em] uppercase" style={{ color: c.accent }}>REVIEW DONE</p>
            <h3 className="type-page" style={{ color: c.fg }}>本轮语块复习完成</h3>
            <p className="type-secondary" style={{ color: c.fgMuted }}>已按记忆曲线自动安排下次复习时间。</p>
            <Button c={c} variant="primary" onClick={() => setReviewOpen(false)}>返回今日学习</Button>
          </div>
        ) : activeReviewChunk ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium zen-tnum" style={{ color: c.fgMuted }}>
                {reviewIdx + 1} / {reviewQueue.length}
              </span>
              <Button c={c} variant="ghost" onClick={() => setReviewOpen(false)}>退出</Button>
            </div>

            <div className="rounded-2xl p-6 text-center space-y-3" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-subtle)" }}>
              <p className="text-xs font-semibold" style={{ color: c.accent }}>看中文，试着开口说出英文</p>
              <h3 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
                {activeReviewChunk.zh || "（无中文释义，点击下方查看原文）"}
              </h3>
              {activeReviewChunk.context && (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  出处：{activeReviewChunk.context}
                </p>
              )}

              {revealed && (
                <div className="pt-4 mt-4 border-t space-y-2" style={{ borderColor: "var(--border-subtle)" }}>
                  <p className="text-2xl font-bold" style={{ color: "var(--accent-primary)" }} lang="en">
                    {activeReviewChunk.en}
                  </p>
                  <button
                    type="button"
                    onClick={() => speakVocabText(activeReviewChunk.en, 0.9)}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium cursor-pointer"
                    style={{ background: c.accentDim, color: c.accent }}
                  >
                    重听发音
                  </button>
                </div>
              )}
            </div>

            {!revealed ? (
              <Button
                c={c}
                variant="primary"
                className="w-full"
                onClick={() => {
                  setRevealed(true);
                  speakVocabText(activeReviewChunk.en, 0.9);
                }}
              >
                查看英文并朗读
              </Button>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Button
                  c={c}
                  variant="secondary"
                  onClick={() => {
                    recordUserChunkReview(activeReviewChunk.id, false);
                    setRevealed(false);
                    setReviewIdx((i) => i + 1);
                  }}
                >
                  还生疏（明天再练）
                </Button>
                <Button
                  c={c}
                  variant="primary"
                  onClick={() => {
                    recordUserChunkReview(activeReviewChunk.id, true);
                    setRevealed(false);
                    setReviewIdx((i) => i + 1);
                  }}
                >
                  记住了（拉长间隔）
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
