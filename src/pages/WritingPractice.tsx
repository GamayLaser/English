import { useEffect, useRef, useState } from "react";
import { EnglishButton, EnglishEmptyState } from "../components/english/EnglishUi";
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
  const [topicId, setTopicId] = useState(() => loadLastWritingTopic() ?? topics[0]?.id ?? "");
  const topic = topics.find((item) => item.id === topicId) ?? topics[0];
  const [progress, setProgress] = useState<WritingProgress>(() => topic ? loadWritingProgress(topic.id) : { draft: "", lastOpenedAt: 0 });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
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

  function updateDraft(draft: string) {
    setProgress(saveWritingDraft(topic.id, draft));
    setMessage("");
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

  return <div className="flex w-full flex-col gap-4 pb-8 pt-5">
    <Card c={c}>
      <div className="p-6 md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between"><div className="max-w-2xl"><p className="text-xs font-semibold tracking-[0.16em]" style={{ color: c.accent }}>WRITING TASK</p><h3 className="mt-2 text-xl font-semibold" style={{ color: c.fg }}>{topic.prompt}</h3><p className="mt-2 text-sm leading-relaxed" style={{ color: c.fgMuted }}>至少 {topic.minWords} 词，建议写到 {topic.recommendedWords} 词左右。</p></div><span className="shrink-0 rounded-xl px-4 py-2 text-sm font-semibold tabular-nums" style={{ background: wordCount >= topic.minWords ? c.successDim : c.inputBg, color: wordCount >= topic.minWords ? c.success : c.fgMuted }}>{wordCount} / {topic.minWords} 词</span></div>
        <div className="mt-6 grid gap-4 md:grid-cols-2"><section className="rounded-2xl p-5" style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}><p className="text-sm font-semibold" style={{ color: c.fg }}>需要写到</p><ol className="mt-3 space-y-2 text-sm leading-relaxed" style={{ color: c.fgSub }}>{topic.requiredPoints.map((point, index) => <li key={point}><span className="mr-2 font-semibold" style={{ color: c.accent }}>{index + 1}.</span>{point}</li>)}</ol></section><section className="rounded-2xl p-5" style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}><p className="text-sm font-semibold" style={{ color: c.fg }}>可以参考的词</p><div className="mt-3 flex flex-wrap gap-2">{topic.vocabularyHints.map((word) => <span key={word} className="rounded-lg px-3 py-1.5 text-sm" style={{ background: c.card, color: c.accent }}>{word}</span>)}</div></section></div>
      </div>
    </Card>
    <Card c={c}>
        <div className="p-6 md:p-8"><div className="flex items-center justify-between gap-4"><div><h3 className="text-base font-semibold" style={{ color: c.fg }}>你的作文</h3><p className="mt-1 text-sm" style={{ color: c.fgMuted }}>草稿会自动保存到云端。</p></div><span className="text-xs" style={{ color: wordCount >= topic.minWords ? c.success : c.fgMuted }}>{wordCount >= topic.minWords ? "已达到最低词数" : `还差 ${topic.minWords - wordCount} 词`}</span></div>
        <textarea value={progress.draft} onChange={(event) => updateDraft(event.target.value)} placeholder="在这里写下你的英语短文…" className="type-english mt-5 min-h-72 w-full resize-y rounded-2xl px-5 py-4 outline-none transition focus:ring-2 focus:ring-indigo-400/50" style={{ background: c.inputBg, border: `1px solid ${c.inputBorder}`, color: c.fg, caretColor: c.accent }} />
        {message && <p className="mt-4 text-sm" style={{ color: c.danger }}>{message}</p>}
        <div className="mt-5 flex justify-end"><EnglishButton variant="primary" c={c} disabled={busy} onClick={() => void evaluateDraft()}>{busy ? "AI 正在评分…" : "交给 AI 评分与解析"}</EnglishButton></div>
        {progress.evaluation && <WritingEvaluationCard c={c} evaluation={progress.evaluation} onComplete={completeGroup} />}
      </div>
    </Card>
  </div>;
}

function WritingEvaluationCard({ c, evaluation, onComplete }: { c: ThemeColors; evaluation: NonNullable<WritingProgress["evaluation"]>; onComplete: () => void }) {
  const scores: Array<[string, number]> = [["内容", evaluation.scores.content], ["语法", evaluation.scores.grammar], ["词汇", evaluation.scores.vocabulary], ["结构", evaluation.scores.structure]];
  return <section className="mt-6 border-t pt-6" style={{ borderColor: c.borderSub }}><div className="rounded-2xl p-5" style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}><div className="flex items-center justify-between gap-4"><p className="text-base font-semibold" style={{ color: c.fg }}>AI 写作解析</p><span className="type-display" style={{ color: c.accent }}>{evaluation.totalScore} 分</span></div><div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">{scores.map(([label, score]) => <div key={label} className="rounded-xl px-4 py-3" style={{ background: c.card }}><p className="text-xs" style={{ color: c.fgMuted }}>{label}</p><p className="type-page mt-1" style={{ color: c.fg }}>{score}<span className="ml-1 text-xs font-normal" style={{ color: c.fgMuted }}>/25</span></p></div>)}</div><p className="mt-5 text-sm leading-relaxed" style={{ color: c.fgSub }}>{evaluation.feedback}</p>{evaluation.strengths.length > 0 && <div className="mt-5"><p className="text-xs font-semibold tracking-wide" style={{ color: c.fgMuted }}>你已经做到</p><div className="mt-2 flex flex-wrap gap-2">{evaluation.strengths.map((item) => <span key={item} className="rounded-lg px-3 py-1.5 text-xs" style={{ background: `${c.accent}14`, color: c.accent }}>{item}</span>)}</div></div>}{evaluation.improvements.length > 0 && <div className="mt-5"><p className="text-xs font-semibold tracking-wide" style={{ color: c.fgMuted }}>下一步可以修改</p><ul className="mt-2 space-y-1.5 text-sm leading-relaxed" style={{ color: c.fgSub }}>{evaluation.improvements.map((item) => <li key={item}>· {item}</li>)}</ul></div>}<div className="mt-5 rounded-xl p-4" style={{ background: c.card }}><p className="text-xs font-semibold tracking-wide" style={{ color: c.fgMuted }}>参考润色稿</p><p className="mt-3 whitespace-pre-wrap text-base leading-relaxed" style={{ color: c.fg }}>{evaluation.revisedWriting}</p></div></div><div className="mt-5 flex justify-end"><EnglishButton variant="primary" c={c} onClick={onComplete}>完成本组并进入下一组</EnglishButton></div></section>;
}

