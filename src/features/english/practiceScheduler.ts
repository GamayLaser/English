import type { PracticeQuestion, Sentence, WrongBookItem } from "./types";

export const PRACTICE_GROUP_SIZE = 40;
const REVIEW_RATIO = 0.3;
const MAX_REVIEWS_PER_GROUP = Math.round(PRACTICE_GROUP_SIZE * REVIEW_RATIO);

export interface SchedulerInput {
  library: Sentence[];
  wrongBook: WrongBookItem[];
  groupsCreated: number;
  reviewsAssigned: number;
}

function shuffled<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

function targetReviewsAfterGroup(groupsCreated: number) {
  return Math.round((groupsCreated + 1) * PRACTICE_GROUP_SIZE * REVIEW_RATIO);
}

export function createPracticeSet({ library, wrongBook, groupsCreated, reviewsAssigned }: SchedulerInput): PracticeQuestion[] {
  const libraryIds = new Set(library.map((sentence) => sentence.id));
  const reviewCandidates = wrongBook.filter((item) => libraryIds.has(item.sentence.id));
  const reviewCount = Math.max(0, Math.min(MAX_REVIEWS_PER_GROUP, targetReviewsAfterGroup(groupsCreated) - reviewsAssigned, reviewCandidates.length));
  const reviews = [...reviewCandidates]
    .sort((a, b) => b.wrongCount - a.wrongCount || a.lastReviewedAt - b.lastReviewedAt)
    .slice(0, reviewCount)
    .map((item) => ({ sentence: item.sentence, kind: "review" as const, previousIssues: item.latestAttempt?.evaluation.issues ?? [] }));
  const usedIds = new Set(reviews.map((item) => item.sentence.id));
  const fresh = shuffled(library.filter((sentence) => !usedIds.has(sentence.id)))
    .slice(0, PRACTICE_GROUP_SIZE - reviews.length)
    .map((sentence) => ({ sentence, kind: "fresh" as const, previousIssues: [] }));

  return shuffled([...reviews, ...fresh]).map((item, index, items) => ({
    ...item,
    direction: index < Math.ceil(items.length / 2) ? "en2zh" as const : "zh2en" as const,
  }));
}

