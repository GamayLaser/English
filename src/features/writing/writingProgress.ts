import { workspaceStorage } from "../persistence/privateWorkspaceStore";
import type { WritingTopic } from "../english/types";
import type { WritingEvaluation } from "./writingTypes";

const progressKey = "english:writing-progress-v2";
const lastTopicKey = "english:writing-last-topic-v2";
const reportsKey = "english:writing-reports-v2";

export interface WritingProgress {
  draft: string;
  evaluation?: WritingEvaluation;
  lastOpenedAt: number;
}

export interface WritingReport {
  topic: WritingTopic;
  draft: string;
  evaluation: WritingEvaluation;
  completedAt: number;
}

export function loadWritingProgress(topicId: string): WritingProgress {
  return loadProgressMap()[topicId] ?? emptyProgress();
}

export function saveWritingDraft(topicId: string, draft: string): WritingProgress {
  const progress = { ...loadWritingProgress(topicId), draft, evaluation: undefined, lastOpenedAt: Date.now() };
  saveProgress(topicId, progress);
  return progress;
}

export function saveWritingEvaluation(topicId: string, evaluation: WritingEvaluation): WritingProgress {
  const progress = { ...loadWritingProgress(topicId), evaluation, lastOpenedAt: Date.now() };
  saveProgress(topicId, progress);
  return progress;
}

export function saveLastWritingTopic(topicId: string) {
  workspaceStorage.setItem(lastTopicKey, topicId);
}

export function loadLastWritingTopic() {
  return workspaceStorage.getItem(lastTopicKey);
}

export function loadWritingReports(): WritingReport[] {
  try {
    const saved = JSON.parse(workspaceStorage.getItem(reportsKey) ?? "") as unknown;
    return Array.isArray(saved) ? saved.filter(isWritingReport).sort((a, b) => b.completedAt - a.completedAt) : [];
  } catch {
    return [];
  }
}

export function formatWritingReportTitle(report: Pick<WritingReport, "topic" | "evaluation">) {
  return `${report.topic.title} · ${report.evaluation.totalScore} 分`;
}

export function saveWritingReport(input: WritingReport): WritingReport[] {
  const snapshot: WritingReport = {
    topic: { ...input.topic, requiredPoints: [...input.topic.requiredPoints], vocabularyHints: [...input.topic.vocabularyHints] },
    draft: input.draft,
    evaluation: { ...input.evaluation, scores: { ...input.evaluation.scores }, strengths: [...input.evaluation.strengths], improvements: [...input.evaluation.improvements] },
    completedAt: input.completedAt,
  };
  const reports = [snapshot, ...loadWritingReports()].sort((a, b) => b.completedAt - a.completedAt).slice(0, 30);
  workspaceStorage.setItem(reportsKey, JSON.stringify(reports));
  return reports;
}

export function nextWritingTopicId(topics: WritingTopic[], topicId: string): string | null {
  if (!topics.length) return null;
  const index = topics.findIndex((topic) => topic.id === topicId);
  return topics[index < 0 ? 0 : (index + 1) % topics.length].id;
}

export function completeWritingGroup({ topics, topic, progress, completedAt }: { topics: WritingTopic[]; topic: WritingTopic; progress: WritingProgress; completedAt: number }): { nextTopicId: string | null } {
  if (progress.evaluation) saveWritingReport({ topic, draft: progress.draft, evaluation: progress.evaluation, completedAt });
  return { nextTopicId: nextWritingTopicId(topics, topic.id) };
}

function emptyProgress(): WritingProgress {
  return { draft: "", lastOpenedAt: 0 };
}

function loadProgressMap(): Record<string, WritingProgress> {
  try {
    const saved = JSON.parse(workspaceStorage.getItem(progressKey) ?? "") as unknown;
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved as Record<string, WritingProgress> : {};
  } catch {
    return {};
  }
}

function saveProgress(topicId: string, progress: WritingProgress) {
  workspaceStorage.setItem(progressKey, JSON.stringify({ ...loadProgressMap(), [topicId]: progress }));
}

function isWritingReport(value: unknown): value is WritingReport {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const report = value as Partial<WritingReport>;
  return Boolean(
    report.topic && typeof report.topic.id === "string" && typeof report.topic.title === "string" && typeof report.topic.prompt === "string"
    && typeof report.draft === "string" && typeof report.completedAt === "number" && isWritingEvaluation(report.evaluation),
  );
}

function isWritingEvaluation(value: unknown): value is WritingEvaluation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const evaluation = value as Partial<WritingEvaluation>;
  const scores = evaluation.scores;
  return typeof evaluation.totalScore === "number" && Boolean(scores) && typeof scores?.content === "number" && typeof scores?.grammar === "number"
    && typeof scores?.vocabulary === "number" && typeof scores?.structure === "number" && typeof evaluation.feedback === "string"
    && Array.isArray(evaluation.strengths) && evaluation.strengths.every((item) => typeof item === "string")
    && Array.isArray(evaluation.improvements) && evaluation.improvements.every((item) => typeof item === "string") && typeof evaluation.revisedWriting === "string";
}



