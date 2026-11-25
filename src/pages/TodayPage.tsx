import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { EnglishPageHeader } from "../components/english/EnglishUi";
import { Button, Card } from "../components/ui";
import { loadReports, loadWrongBook } from "../features/english/storage";
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

  useEffect(() => {
    const refresh = () => setTick((t) => t + 1);
    window.addEventListener("workspace:stats-updated", refresh);
    return () => window.removeEventListener("workspace:stats-updated", refresh);
  }, []);

  void tick;
  const vocab = loadVocabProgress();
  const wrongPending = loadWrongBook().filter((item) => item.lastVerdict !== "acceptable").length;
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
            <p className="type-secondary mt-1.5" style={{ color: c.fgMuted }}>
              先用插画和例句熟悉核心词，再用「听音辨词」训练耳朵一听就懂的条件反射。
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
            <p className="type-secondary mt-1.5" style={{ color: c.fgMuted }}>
              从 A/B 情景短对话过渡到原声听力默写，适应真实语速与日常口语表达。
            </p>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button c={c} variant="primary" onClick={() => navigate("/sentences")}>
              情景句子
            </Button>
            <Button c={c} variant="secondary" onClick={() => navigate("/listening")}>
              听力训练
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
            <p className="type-secondary mt-1.5" style={{ color: c.fgMuted }}>
              通过句子翻译和阅读理解检验掌握度，错题自动进入 30% 间隔复习队列。
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
                  <p className="text-[15px] font-semibold leading-snug" style={{ color: c.fg }}>
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
                  <p className="text-[13px] font-medium" style={{ color: c.fgSub }}>
                    {phrase.zh}
                  </p>
                  <p className="mt-1 text-[11.5px]" style={{ color: c.fgMuted }}>
                    {phrase.tip}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
