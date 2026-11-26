import { useState } from "react";
import { useNavigate } from "react-router";
import { EnglishPageHeader } from "../components/english/EnglishUi";
import { ERROR_LABELS } from "../components/english/RadarScoreCard";
import { Button, Card } from "../components/ui";
import { loadWrongBook, removeWrongBookItem } from "../features/english/storage";
import type { WrongBookItem } from "../features/english/types";
import { speakVocabText } from "../features/vocab/vocabStore";
import type { ThemeColors } from "../types";

export default function WrongbookPage({
  c,
  onStartPractice,
}: {
  c: ThemeColors;
  onStartPractice?: () => void;
}) {
  const navigate = useNavigate();
  const [rawItems, setRawItems] = useState<WrongBookItem[]>(() => loadWrongBook());
  const items: WrongBookItem[] = [...rawItems].sort(
    (a, b) => b.wrongCount - a.wrongCount || (a.lastReviewedAt || 0) - (b.lastReviewedAt || 0),
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const goPractice = onStartPractice ?? (() => navigate("/practice"));

  function handleRemove(sentenceId: string) {
    setRawItems(removeWrongBookItem(sentenceId));
  }

  return (
    <div className="container-focus space-y-5 pb-8 zen-page-enter">
      <EnglishPageHeader
        c={c}
        eyebrow="REVIEW QUEUE"
        title="错题本"
        description="下一组练习按 30% 比例自动抽取这些题目；错得更多、越久未复习的优先。"
        aside={
          <div className="flex items-center gap-2">
            <span
              className="rounded-xl px-3 py-2 text-xs font-semibold zen-tnum"
              style={{ background: c.inputBg, color: c.fgMuted }}
            >
              共 {items.length} 题
            </span>
            <Button type="button" variant="primary" c={c} onClick={goPractice}>
              开始错题强化
            </Button>
          </div>
        }
      />

      {items.length === 0 ? (
        <Card c={c}>
          <p className="py-14 text-center text-sm" style={{ color: c.fgMuted }}>
            还没有需要复习的题目。
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const isOpen = expandedId === item.sentence.id;
            return (
              <Card key={item.sentence.id} c={c} className="p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <p
                        className="text-base font-bold leading-snug"
                        style={{ color: "var(--text-primary)" }}
                        lang="en"
                      >
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
                    <Button
                      type="button"
                      variant="secondary"
                      c={c}
                      onClick={() =>
                        onStartPractice
                          ? onStartPractice()
                          : navigate(`/practice?wrongId=${encodeURIComponent(item.sentence.id)}`)
                      }
                    >
                      强化
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      c={c}
                      onClick={() => handleRemove(item.sentence.id)}
                    >
                      移出
                    </Button>
                  </div>
                </div>

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
                            {ERROR_LABELS[issue.category]}
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
