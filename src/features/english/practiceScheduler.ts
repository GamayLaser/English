import type { PracticeQuestion, Sentence, WrongBookItem } from "./types";

export const PRACTICE_GROUP_SIZE = 40;
const REVIEW_RATIO = 0.3;
const MAX_REVIEWS_PER_GROUP = Math.round(PRACTICE_GROUP_SIZE * REVIEW_RATIO);
const DAY_MS = 86_400_000;

export type PracticeDirectionMode = "zh2en" | "en2zh" | "mixed";

export interface SchedulerInput {
  library: Sentence[];
  wrongBook: WrongBookItem[];
  groupsCreated: number;
  reviewsAssigned: number;
  directionMode?: PracticeDirectionMode;
}

function shuffled<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function targetReviewsAfterGroup(groupsCreated: number) {
  return Math.round((groupsCreated + 1) * PRACTICE_GROUP_SIZE * REVIEW_RATIO);
}

/** Simplified SM-2 due urgency: higher value means more overdue / urgent to review. */
function reviewPriority(item: WrongBookItem, now: number): number {
  const daysSince = Math.max(0, (now - (item.lastReviewedAt || 0)) / DAY_MS);
  const intervalDays = item.lastVerdict === "acceptable" ? Math.max(1, (item.reviewCount + 1) * 2) : 0.5;
  return (daysSince / intervalDays) + item.wrongCount * 0.6;
}

export function createPracticeSet({
  library,
  wrongBook,
  groupsCreated,
  reviewsAssigned,
  directionMode = "zh2en",
}: SchedulerInput): PracticeQuestion[] {
  const now = Date.now();
  const libraryIds = new Set(library.map((sentence) => sentence.id));
  const reviewCandidates = wrongBook.filter((item) => item.lastVerdict !== "acceptable" && libraryIds.has(item.sentence.id));
  const reviewCount = Math.max(
    0,
    Math.min(MAX_REVIEWS_PER_GROUP, targetReviewsAfterGroup(groupsCreated) - reviewsAssigned, reviewCandidates.length),
  );

  const reviews = [...reviewCandidates]
    .sort((a, b) => reviewPriority(b, now) - reviewPriority(a, now))
    .slice(0, reviewCount)
    .map((item) => ({
      sentence: item.sentence,
      kind: "review" as const,
      previousIssues: item.latestAttempt?.evaluation.issues ?? [],
    }));

  const usedIds = new Set(reviews.map((item) => item.sentence.id));
  const fresh = shuffled(library.filter((sentence) => !usedIds.has(sentence.id)))
    .slice(0, PRACTICE_GROUP_SIZE - reviews.length)
    .map((sentence) => ({ sentence, kind: "fresh" as const, previousIssues: [] }));

  return shuffled([...reviews, ...fresh]).map((item, index) => {
    const direction =
      directionMode === "zh2en"
        ? ("zh2en" as const)
        : directionMode === "en2zh"
          ? ("en2zh" as const)
          : index % 2 === 0
            ? ("zh2en" as const)
            : ("en2zh" as const);
    return { ...item, direction };
  });
}
