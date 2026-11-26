import { AUTO_ADVANCE_MS } from "../../features/english/practiceFlow";
import type { Evaluation, PracticeAttempt } from "../../features/english/types";
import { speakVocabText } from "../../features/vocab/vocabStore";
import type { ThemeColors } from "../../types";
import { Button, Card } from "../ui";
import { computeAggregateDimensions, computeDimensionScores, ERROR_LABELS, RadarChart5D, ScoreGauge } from "./RadarScoreCard";

export function AutoAdvance({ c }: { c: ThemeColors }) {
  return (
    <div className="self-center rounded-xl px-5 py-3 text-center" style={{ background: c.successDim, color: c.success }}>
      <p className="text-sm font-semibold">回答正确，即将自动进入下一题</p>
      <div className="mt-2 h-1.5 w-52 overflow-hidden rounded-full" style={{ background: c.inputBg }}>
        <div
          data-testid="auto-advance-progress"
          className="h-full w-full rounded-full"
          style={{
            background: c.success,
            transformOrigin: "left",
            animation: `auto-advance-progress ${AUTO_ADVANCE_MS}ms linear forwards`,
          }}
        />
      </div>
    </div>
  );
}

export function DiffFeedbackCard({ c, answer, evaluation }: { c: ThemeColors; answer: string; evaluation: Evaluation }) {
  const good = evaluation.verdict === "acceptable";
  const badgeColor = good ? c.success : c.danger;
  const dimScores = computeDimensionScores(evaluation);

  return (
    <div className="w-full space-y-4 zen-page-enter">
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

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
        <div className="grid gap-3">
          <div
            className="rounded-xl p-4"
            style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-subtle)" }}
          >
            <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
              你的表达
            </p>
            <p
              className={`mt-1.5 text-[15px] font-medium leading-relaxed ${
                !good ? "underline decoration-red-400/70 decoration-wavy underline-offset-4" : ""
              }`}
              style={{ color: "var(--text-primary)" }}
            >
              {answer}
            </p>
          </div>

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
                  {ERROR_LABELS[issue.category]}
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

export function PracticeCompletedCard({
  c,
  total,
  accepted,
  tags,
  attempts,
  onRestart,
  onWrongBook,
}: {
  c: ThemeColors;
  total: number;
  accepted: number;
  tags: Record<string, number>;
  attempts: PracticeAttempt[];
  onRestart: () => void;
  onWrongBook: () => void;
}) {
  const pct = Math.round((accepted / total) * 100);
  const aggScores = computeAggregateDimensions(attempts);

  return (
    <Card c={c}>
      <div className="mx-auto max-w-3xl p-6 text-center zen-page-enter md:p-8">
        <h2 className="type-page mb-2" style={{ color: c.fg }}>本组练习完成</h2>
        <p className="text-sm" style={{ color: c.fgMuted }}>
          共 {total} 道题目，{accepted} 道表达地道 · 错题已自动归入复习队列
        </p>

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

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl p-4" style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}>
            <span className="text-xs font-semibold" style={{ color: c.fgMuted }}>总题数</span>
            <p className="type-display mt-1" style={{ color: c.fg }}>{total}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}>
            <span className="text-xs font-semibold" style={{ color: c.accent }}>可接受</span>
            <p className="type-display mt-1" style={{ color: c.accent }}>{accepted}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}>
            <span className="text-xs font-semibold" style={{ color: c.danger }}>需巩固</span>
            <p className="type-display mt-1" style={{ color: c.danger }}>{total - accepted}</p>
          </div>
        </div>

        {Object.keys(tags).length > 0 && (
          <div className="mt-6 grid grid-cols-1 gap-3 text-left md:grid-cols-2">
            {Object.entries(tags).map(([tag, count]) => (
              <div key={tag} className="rounded-xl p-4 border" style={{ background: c.inputBg, borderColor: c.borderSub }}>
                <p className="text-sm font-semibold flex items-center justify-between" style={{ color: c.fg }}>
                  <span>{ERROR_LABELS[tag as keyof typeof ERROR_LABELS] || tag}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: c.dangerDim, color: c.danger }}>{count} 次待加强</span>
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
