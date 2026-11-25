import { workspaceStorage } from "../persistence/privateWorkspaceStore";
import { loadReports } from "./storage";
import type { SentenceLearningStat, SentenceLearningStats } from "./types";

const KEY = "english:sentence-learning-stats-v2";

export function loadSentenceLearningStats(): SentenceLearningStats {
  try {
    const saved = JSON.parse(workspaceStorage.getItem(KEY) ?? "") as unknown;
    if (isStats(saved)) return saved;
  } catch { /* hydrate below */ }
  const hydrated = hydrateFromReports();
  save(hydrated);
  return hydrated;
}

export function recordSentenceAttempt(sentenceId: string, score: number, at = Date.now()) {
  const stats = loadSentenceLearningStats();
  const previous = stats[sentenceId] ?? emptyStat();
  stats[sentenceId] = {
    attemptCount: previous.attemptCount + 1,
    bestScore: Math.max(previous.bestScore, Math.max(0, Math.min(100, Math.round(score)))),
    lastAnsweredAt: at,
  };
  save(stats);
  return stats;
}

function hydrateFromReports() {
  return loadReports().flatMap((report) => report.attempts).reduce<SentenceLearningStats>((stats, attempt) => {
    const id = attempt.question.sentence.id;
    const previous = stats[id] ?? emptyStat();
    stats[id] = {
      attemptCount: previous.attemptCount + 1,
      bestScore: Math.max(previous.bestScore, attempt.evaluation.score),
      lastAnsweredAt: Math.max(previous.lastAnsweredAt, attempt.completedAt),
    };
    return stats;
  }, {});
}

function emptyStat(): SentenceLearningStat {
  return { attemptCount: 0, bestScore: 0, lastAnsweredAt: 0 };
}

function save(stats: SentenceLearningStats) {
  workspaceStorage.setItem(KEY, JSON.stringify(stats));
}

function isStats(value: unknown): value is SentenceLearningStats {
  return Boolean(value && typeof value === "object" && Object.values(value as Record<string, unknown>).every((item) => {
    if (!item || typeof item !== "object") return false;
    const stat = item as SentenceLearningStat;
    return [stat.attemptCount, stat.bestScore, stat.lastAnsweredAt].every((number) => typeof number === "number" && Number.isFinite(number));
  }));
}



