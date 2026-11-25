import { workspaceStorage } from "../persistence/privateWorkspaceStore";
import type { Evaluation, PracticeAttempt, PracticeQuestion, PracticeReport, SchedulerHistory, WrongBookItem } from "./types";

const WRONG_BOOK_KEY = "english:wrongbook-v3";
const REPORTS_KEY = "english:reports-v3";
const HISTORY_KEY = "english:scheduler-history-v2";
const TRANSLATION_SESSION_KEY = "english:translation-session-v1";

export interface TranslationPracticeSession {
  questions: PracticeQuestion[];
  index: number;
  answer: string;
  attempts: PracticeAttempt[];
  evaluation: Evaluation | null;
}

function read<T>(key: string, fallback: T): T {
  try { return JSON.parse(workspaceStorage.getItem(key) ?? "") as T; } catch { return fallback; }
}

export function loadWrongBook() { return read<WrongBookItem[]>(WRONG_BOOK_KEY, []); }
export function saveWrongBook(items: WrongBookItem[]) { workspaceStorage.setItem(WRONG_BOOK_KEY, JSON.stringify(items)); }
export function loadReports() { return read<PracticeReport[]>(REPORTS_KEY, []); }
export function saveReports(items: PracticeReport[]) { workspaceStorage.setItem(REPORTS_KEY, JSON.stringify(items.slice(0, 30))); }
export function loadSchedulerHistory() { return read<SchedulerHistory>(HISTORY_KEY, { groupsCreated: 0, reviewsAssigned: 0 }); }
export function saveSchedulerHistory(history: SchedulerHistory) { workspaceStorage.setItem(HISTORY_KEY, JSON.stringify(history)); }
export function loadTranslationPracticeSession() {
  const session = read<TranslationPracticeSession | null>(TRANSLATION_SESSION_KEY, null);
  return isTranslationPracticeSession(session) ? session : null;
}
export function saveTranslationPracticeSession(session: TranslationPracticeSession) { workspaceStorage.setItem(TRANSLATION_SESSION_KEY, JSON.stringify(session)); }
export function clearTranslationPracticeSession() { workspaceStorage.removeItem(TRANSLATION_SESSION_KEY); }

export function upsertWrongBookItem(attempt: PracticeAttempt) {
  const items = loadWrongBook();
  const previous = items.find(item => item.sentence.id === attempt.question.sentence.id);
  const next: WrongBookItem = {
    sentence: attempt.question.sentence,
    wrongCount: (previous?.wrongCount ?? 0) + (attempt.evaluation.verdict === "needs_improvement" ? 1 : 0),
    reviewCount: (previous?.reviewCount ?? 0) + (attempt.question.kind === "review" ? 1 : 0),
    lastReviewedAt: attempt.question.kind === "review" ? attempt.completedAt : previous?.lastReviewedAt ?? 0,
    lastVerdict: attempt.evaluation.verdict,
    latestAttempt: attempt,
  };
  const updated = [...items.filter(item => item.sentence.id !== next.sentence.id), next];
  saveWrongBook(updated);
  return updated;
}

function isTranslationPracticeSession(value: unknown): value is TranslationPracticeSession {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const session = value as Partial<TranslationPracticeSession>;
  return Array.isArray(session.questions) && typeof session.index === "number" && Number.isInteger(session.index) && session.index >= 0
    && typeof session.answer === "string" && Array.isArray(session.attempts)
    && (session.evaluation === null || typeof session.evaluation === "object");
}

