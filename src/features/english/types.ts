export type Direction = "en2zh" | "zh2en";
export type ErrorTag = "meaning" | "grammar" | "word_order" | "collocation" | "naturalness";

export interface Sentence {
  id: string;
  en: string;
  zh: string;
  source?: "built-in" | "imported";
}

export interface ImportResult {
  added: Sentence[];
  duplicates: number;
  invalid: number;
}

export type ReadingArticleSource = "built-in" | "imported";

export interface ReadingArticle {
  id: string;
  title: string;
  content: string;
  source: ReadingArticleSource;
}

export interface WritingTopic {
  id: string;
  title: string;
  prompt: string;
  minWords: number;
  recommendedWords: number;
  requiredPoints: string[];
  vocabularyHints: string[];
}
export type ListeningArticleSource = "built-in" | "imported";
export interface ListeningArticle { id: string; title: string; content: string; source: ListeningArticleSource; }
export interface ImportListeningResult { added: ListeningArticle[]; duplicates: number; invalid: number; }

export interface ImportReadingResult {
  added: ReadingArticle[];
  duplicates: number;
  invalid: number;
}

export interface SentenceLearningStat {
  attemptCount: number;
  bestScore: number;
  lastAnsweredAt: number;
}

export type SentenceLearningStats = Record<string, SentenceLearningStat>;

export interface AiSettings {
  apiKey: string;
  model: "deepseek-v4-flash";
}

export interface EvaluationIssue {
  category: ErrorTag;
  userFragment: string;
  explanation: string;
  suggestion: string;
}

export interface Evaluation {
  verdict: "acceptable" | "needs_improvement";
  score: number;
  acceptedTranslations: string[];
  feedback: string;
  issues: EvaluationIssue[];
  errorTags: ErrorTag[];
}

export interface PracticeQuestion {
  sentence: Sentence;
  direction: Direction;
  kind: "fresh" | "review";
  previousIssues: EvaluationIssue[];
}

export interface PracticeAttempt {
  question: PracticeQuestion;
  answer: string;
  evaluation: Evaluation;
  completedAt: number;
}

export interface WrongBookItem {
  sentence: Sentence;
  wrongCount: number;
  reviewCount: number;
  lastReviewedAt: number;
  lastVerdict: Evaluation["verdict"];
  latestAttempt: PracticeAttempt | null;
}

export interface SchedulerHistory {
  groupsCreated: number;
  reviewsAssigned: number;
}

export interface PracticeReport {
  date: string;
  attempts: PracticeAttempt[];
  createdAt: number;
}
