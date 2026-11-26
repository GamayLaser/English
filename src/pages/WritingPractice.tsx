import { useEffect, useMemo, useRef, useState } from "react";
import { EnglishButton, EnglishEmptyState, EnglishPageHeader } from "../components/english/EnglishUi";
import { Modal } from "../components/ui";
import { loadUserChunks } from "../features/chunks/chunksStore";
import { speakVocabText } from "../features/vocab/vocabStore";
import { loadAiSettings } from "../features/english/aiSettings";
import type { WritingTopic } from "../features/english/types";
import { loadWritingTopics } from "../features/writing/writingLibrary";
import { completeWritingGroup, loadLastWritingTopic, loadWritingProgress, saveLastWritingTopic, saveWritingDraft, saveWritingEvaluation, type WritingProgress } from "../features/writing/writingProgress";
import { evaluateWriting } from "../features/writing/writingEvaluator";
import type { ThemeColors } from "../types";
import Card from "../components/ui/Card";
import type { WorkspaceUpdate } from "../features/persistence/workspaceUpdateRouting";

export function countEnglishWords(text: string) {
  return text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length ?? 0;
}

export default function WritingPractice({ c, workspaceUpdate = null }: { c: ThemeColors; workspaceUpdate?: WorkspaceUpdate | null }) {
  const [topics] = useState(loadWritingTopics);
  const [topicId, setTopicId] = useState(() => {
    const saved = loadLastWritingTopic();
    if (saved && topics.some((t) => t.id === saved)) return saved;
    const firstPending = topics.find((t) => !loadWritingProgress(t.id).evaluation);
    return firstPending?.id ?? topics[0]?.id ?? "";
  });
  const [levelFilter, setLevelFilter] = useState<"all" | "basic" | "intermediate" | "real">("all");
  const topic = topics.find((item) => item.id === topicId) ?? topics[0];
  const [progress, setProgress] = useState<WritingProgress>(() => topic ? loadWritingProgress(topic.id) : { draft: "", lastOpenedAt: 0 });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [topicModalOpen, setTopicModalOpen] = useState(false);
  const [chunkMode, setChunkMode] = useState(false);
  const draftInputRef = useRef<HTMLTextAreaElement>(null);
  const lastWorkspaceRevision = useRef(0);

  useEffect(() => {
    if (!workspaceUpdate || lastWorkspaceRevision.current === workspaceUpdate.revision) return;
    lastWorkspaceRevision.current = workspaceUpdate.revision;
    if (topic && workspaceUpdate.keys.includes("english:writing-progress-v2")) setProgress(loadWritingProgress(topic.id));
  }, [workspaceUpdate?.revision, topic?.id]);

  useEffect(() => {
    if (!topic) return;
    saveLastWritingTopic(topic.id);
    setProgress(loadWritingProgress(topic.id));
    setMessage("");
  }, [topic?.id]);

  if (!topic) return <EnglishEmptyState c={c} title="还没有写作题目" description="写作题目准备好后，就能开始练习。" />;
  const wordCount = countEnglishWords(progress.draft);
  const effectiveMinWords = chunkMode ? 60 : topic.minWords;
  const targetChunks = useMemo(
    () =>
      loadUserChunks()
        .filter((ch) => !ch.mastered && ch.en.trim().length > 1)
        .slice(0, 4),
    [topic.id],
  );

  function updateDraft(draft: string) {
    setProgress(saveWritingDraft(topic.id, draft));
    setMessage("");
  }

  function insertChunkAtCursor(text: string) {
    const el = draftInputRef.current;
    const current = progress.draft;
    if (!el) {
      updateDraft(current ? `${current} ${text}` : text);
      return;
    }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const before = current.slice(0, start);
    const after = current.slice(end);
    const prefix = before.length > 0 && !/\s$/.test(before) ? " " : "";
    const suffix = after.length > 0 && !/^\s/.test(after) ? " " : "";
    const nextDraft = `${before}${prefix}${text}${suffix}${after}`;
    updateDraft(nextDraft);
    const nextCaret = start + prefix.length + text.length;
    window.requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(nextCaret, nextCaret);
    });
  }

  async function evaluateDraft() {
    if (!progress.draft.trim()) { setMessage("请先完成作文后再提交评分。"); return; }
    const settings = loadAiSettings();
    if (!settings) { setMessage("请先在设置中保存 DeepSeek API Key。"); return; }
    setBusy(true);
    setMessage("");
    try {
      setProgress(saveWritingEvaluation(topic.id, await evaluateWriting({ settings, topic, draft: progress.draft })));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "评分失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  function completeGroup() {
    if (!progress.evaluation) return;
    const { nextTopicId } = completeWritingGroup({ topics, topic, progress, completedAt: Date.now() });
    if (nextTopicId) setTopicId(nextTopicId);
  }

  return <div className="container-focus flex flex-col gap-5 pb-8 zen-page-enter">
    <EnglishPageHeader
      c={c}
      eyebrow="WRITING PRACTICE"
      title="写作训练"
      description={`至少 ${topic.minWords} 词，建议写到 ${topic.recommendedWords} 词左右；草稿会自动保存到云端。`}
      aside={
        <>
          {targetChunks.length > 0 && (
            <EnglishButton
              variant={chunkMode ? "primary" : "secondary"}
              c={c}
              onClick={() => setChunkMode((v) => !v)}
            >
              {chunkMode ? "语块造句模式 ✓" : "从语块本出题"}
            </EnglishButton>
          )}
          {topics.length > 1 && (
            <EnglishButton variant="secondary" c={c} onClick={() => setTopicModalOpen(true)}>
              切换题目 ({topics.findIndex((t) => t.id === topic.id) + 1}/{topics.length})
            </EnglishButton>
          )}
          <span className="shrink-0 rounded-xl px-3.5 py-2 text-[13px] font-semibold tabular-nums" style={{ background: wordCount >= effectiveMinWords ? c.successDim : c.inputBg, color: wordCount >= effectiveMinWords ? c.success : c.fgMuted }}>{wordCount} / {effectiveMinWords} 词</span>
        </>
      }
    />
    <Card c={c}>
      <div className="p-5 md:p-6">
        <div>
          <p className="type-caption font-semibold tracking-[0.14em] uppercase" style={{ color: c.accent }}>
            {chunkMode ? "CHUNK CHALLENGE · 60–80 WORDS" : "TOPIC PROMPT"}
          </p>
          <h3 className="mt-1.5 text-lg font-semibold leading-snug" style={{ color: c.fg }}>
            {chunkMode
              ? `用下方 ${targetChunks.length} 个你收藏的语块，写一段 60–80 词的真实生活或工作记录`
              : topic.prompt}
          </h3>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2"><section className="rounded-xl p-4" style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}><p className="text-xs font-semibold" style={{ color: c.fg }}>需要写到</p><ol className="mt-2 space-y-1.5 text-[13px] leading-relaxed" style={{ color: c.fgSub }}>{topic.requiredPoints.map((point, index) => <li key={point}><span className="mr-1.5 font-semibold" style={{ color: c.accent }}>{index + 1}.</span>{point}</li>)}</ol></section><section className="rounded-xl p-4" style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}><p className="text-xs font-semibold" style={{ color: c.fg }}>可以参考的词</p><div className="mt-2 flex flex-wrap gap-1.5">{topic.vocabularyHints.map((word) => <span key={word} className="rounded-lg px-2.5 py-1 text-xs font-medium" style={{ background: c.card, color: c.accent, border: `1px solid ${c.borderSub}` }}>{word}</span>)}</div></section></div>
      </div>
    </Card>
    <Card c={c}>
      <div className="p-5 md:p-8"><div className="flex items-center justify-between gap-4"><div><h3 className="text-base font-semibold" style={{ color: c.fg }}>你的作文</h3><p className="mt-1 text-sm" style={{ color: c.fgMuted }}>完成后可交给 AI 从内容、语法、词汇、结构四维评分。</p></div><span className="text-xs font-medium" style={{ color: wordCount >= effectiveMinWords ? c.success : c.fgMuted }}>{wordCount >= effectiveMinWords ? "已达到最低词数" : `还差 ${effectiveMinWords - wordCount} 词`}</span></div>
        {targetChunks.length > 0 && (
          <div className="mt-4 rounded-xl p-3.5 space-y-2" style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}>
            <p className="text-xs font-semibold" style={{ color: c.fgMuted }}>
              尝试在作文中用上你收藏的语块（点击可插入，用上后自动变绿）：
            </p>
            <div className="flex flex-wrap gap-2">
              {targetChunks.map((ch) => {
                const used = progress.draft.toLowerCase().includes(ch.en.toLowerCase());
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => insertChunkAtCursor(ch.en)}
                    className="rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer"
                    style={{
                      background: used ? c.successDim : c.card,
                      color: used ? c.success : c.accent,
                      border: `1px solid ${used ? c.success : c.borderSub}`,
                    }}
                    title={ch.zh}
                  >
                    {used ? `✓ ${ch.en}` : ch.en}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <textarea ref={draftInputRef} value={progress.draft} onChange={(event) => updateDraft(event.target.value)} placeholder="在这里写下你的英语短文…" className="type-english mt-5 min-h-72 w-full resize-y rounded-2xl px-5 py-4 outline-none transition focus:ring-2 focus:ring-[var(--accent-primary)]/35" style={{ background: c.inputBg, border: `1px solid ${c.inputBorder}`, color: c.fg, caretColor: c.accent }} />
        {message && <p className="mt-4 text-sm" style={{ color: c.danger }}>{message}</p>}
        <div className="mt-5 flex justify-end"><EnglishButton variant="primary" c={c} disabled={busy} onClick={() => void evaluateDraft()}>{busy ? "AI 正在评分…" : "交给 AI 评分与解析"}</EnglishButton></div>
        {progress.evaluation && <WritingEvaluationCard c={c} draft={progress.draft} evaluation={progress.evaluation} onComplete={completeGroup} />}
      </div>
    </Card>

    <Modal c={c} open={topicModalOpen} onClose={() => setTopicModalOpen(false)} label="选择写作题目" maxWidthClassName="max-w-xl">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="type-caption font-semibold tracking-[0.14em] uppercase" style={{ color: c.accent }}>WRITING TOPICS</p>
            <h3 className="type-title mt-0.5" style={{ color: c.fg }}>选择写作题目</h3>
          </div>
          <EnglishButton variant="ghost" c={c} onClick={() => setTopicModalOpen(false)}>关闭</EnglishButton>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: "all", label: "全部" },
              { id: "basic", label: "基础" },
              { id: "intermediate", label: "进阶" },
              { id: "real", label: "真实场景" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setLevelFilter(tab.id)}
              className="rounded-lg px-2.5 py-1 text-xs font-medium cursor-pointer"
              style={
                levelFilter === tab.id
                  ? { background: c.accentDim, color: c.accent }
                  : { background: c.inputBg, color: c.fgMuted }
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="max-h-[55vh] overflow-y-auto space-y-2 pr-1">
          {topics
            .map((item, idx) => ({ item, idx }))
            .filter(({ idx }) =>
              levelFilter === "all"
                ? true
                : levelFilter === "basic"
                  ? idx < 10
                  : levelFilter === "intermediate"
                    ? idx >= 10 && idx < 20
                    : idx >= 20,
            )
            .map(({ item, idx }) => {
            const isCurrent = item.id === topic.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTopicId(item.id);
                  setTopicModalOpen(false);
                }}
                className="w-full rounded-xl px-4 py-3 text-left transition-colors cursor-pointer"
                style={{
                  background: isCurrent ? c.accentDim : c.inputBg,
                  border: `1px solid ${isCurrent ? c.accent : c.borderSub}`,
                }}
              >
                <p className="text-xs font-semibold" style={{ color: isCurrent ? c.accent : c.fgMuted }}>
                  题目 {idx + 1} · 建议 {item.minWords}–{item.recommendedWords} 词
                </p>
                <p className="mt-1 text-sm font-medium leading-snug" style={{ color: c.fg }}>
                  {item.prompt}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  </div>;
}

function WritingEvaluationCard({ c, draft, evaluation, onComplete }: { c: ThemeColors; draft: string; evaluation: NonNullable<WritingProgress["evaluation"]>; onComplete: () => void }) {
  const scores: Array<[string, number]> = [["内容", evaluation.scores.content], ["语法", evaluation.scores.grammar], ["词汇", evaluation.scores.vocabulary], ["结构", evaluation.scores.structure]];
  return (
    <section className="mt-6 border-t pt-6 space-y-4" style={{ borderColor: "var(--border-subtle)" }}>
      <div className="flex items-center justify-between gap-4">
        <p className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>AI 写作解析</p>
        <span className="type-display" style={{ color: "var(--accent-primary)" }}>{evaluation.totalScore} 分</span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {scores.map(([label, score]) => (
          <div key={label} className="rounded-xl px-4 py-3" style={{ background: "var(--bg-subtle)" }}>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</p>
            <p className="type-page mt-1" style={{ color: "var(--text-primary)" }}>
              {score}<span className="ml-1 text-xs font-normal" style={{ color: "var(--text-muted)" }}>/25</span>
            </p>
          </div>
        ))}
      </div>

      <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{evaluation.feedback}</p>

      {/* Diff-style comparison: Original vs Revised */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl p-4" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-subtle)" }}>
          <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>你的原文</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{draft}</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--accent-soft)", border: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold" style={{ color: "var(--accent-primary)" }}>母语者自然润色版</p>
            <button
              type="button"
              onClick={() => speakVocabText(evaluation.revisedWriting, 0.9)}
              className="rounded-lg px-2 py-0.5 text-xs font-medium cursor-pointer"
              style={{ background: "var(--bg-surface)", color: "var(--accent-primary)" }}
            >
              朗读跟读
            </button>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>{evaluation.revisedWriting}</p>
        </div>
      </div>

      {evaluation.improvements.length > 0 && (
        <div className="rounded-xl p-4 border-l-2" style={{ background: "var(--bg-subtle)", borderLeftColor: c.accent }}>
          <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>修改建议</p>
          <ul className="mt-2 space-y-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {evaluation.improvements.map((item) => <li key={item}>· {item}</li>)}
          </ul>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <EnglishButton variant="primary" c={c} onClick={onComplete}>完成本组并进入下一组</EnglishButton>
      </div>
    </section>
  );
}

