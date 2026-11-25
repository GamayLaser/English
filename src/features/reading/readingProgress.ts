import { workspaceStorage } from "../persistence/privateWorkspaceStore";
import type { ReadingArticle } from "../english/types";
import type { ReadingSummaryEvaluation } from "./summaryEvaluator";

const progressKey = "english:reading-progress-v2";
const lastArticleKey = "english:reading-last-article-v2";
const reportsKey = "english:reading-reports-v2";

export interface ReadingLine {
  id: string;
  text: string;
}

export interface ReadingParagraph {
  id: string;
  text: string;
  legacyLineIds: string[];
}

export interface ReadingAnnotation {
  articleId: string;
  lineId: string;
  selectedText: string;
  translation: string;
  startIndex?: number;
  createdAt: number;
}

export interface ReadingProgress {
  summary: string;
  summaryEvaluation?: ReadingSummaryEvaluation;
  annotations: ReadingAnnotation[];
  lastOpenedAt: number;
}

export interface ReadingReport {
  article: ReadingArticle;
  summary: string;
  summaryEvaluation?: ReadingSummaryEvaluation;
  annotations: ReadingAnnotation[];
  completedAt: number;
}

export interface CompleteReadingGroupInput {
  articles: ReadingArticle[];
  article: ReadingArticle;
  progress: ReadingProgress;
  completedAt: number;
}

export interface AnnotatedReadingSegment {
  text: string;
  translation?: string;
}

export function splitReadingLines(content: string): ReadingLine[] {
  return splitReadingParagraphs(content).flat();
}

export function splitReadingParagraphs(content: string): ReadingLine[][] {
  let lineIndex = 0;
  return content.split(/\r?\n+/)
    .map((paragraph) => (paragraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [])
      .map((text) => text.trim()).filter(Boolean)
      .map((text) => ({ id: `line-${lineIndex++}`, text })))
    .filter((paragraph) => paragraph.length > 0);
}

export function createReadingParagraphs(content: string): ReadingParagraph[] {
  const lineGroups = splitReadingParagraphs(content);
  const paragraphTexts = content.split(/\r?\n+/).map((paragraph) => paragraph.trim()).filter(Boolean);
  return paragraphTexts.map((text, index) => ({
    id: `paragraph-${index}`,
    text,
    legacyLineIds: lineGroups[index]?.map((line) => line.id) ?? [],
  }));
}

export function buildAnnotatedSegments(text: string, annotations: ReadingAnnotation[]): AnnotatedReadingSegment[] {
  const lowerText = text.toLocaleLowerCase();
  const matches = annotations.map((annotation) => ({ annotation, index: annotationIndex(lowerText, annotation) }))
    .filter((match) => match.index >= 0).sort((a, b) => a.index - b.index);
  const segments: AnnotatedReadingSegment[] = [];
  let cursor = 0;
  matches.forEach(({ annotation, index }) => {
    const end = index + annotation.selectedText.length;
    if (index < cursor) return;
    if (index > cursor) segments.push({ text: text.slice(cursor, index) });
    segments.push({ text: text.slice(index, end), translation: annotation.translation });
    cursor = end;
  });
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments.length ? segments : [{ text }];
}

export function loadReadingProgress(articleId: string): ReadingProgress {
  return loadProgressMap()[articleId] ?? emptyProgress();
}

export function saveSummary(articleId: string, summary: string): ReadingProgress {
  const progress = { ...loadReadingProgress(articleId), summary, summaryEvaluation: undefined, lastOpenedAt: Date.now() };
  saveProgress(articleId, progress);
  return progress;
}

export function saveSummaryEvaluation(articleId: string, summaryEvaluation: ReadingSummaryEvaluation): ReadingProgress {
  const progress = { ...loadReadingProgress(articleId), summaryEvaluation, lastOpenedAt: Date.now() };
  saveProgress(articleId, progress);
  return progress;
}

export function upsertAnnotation(input: Omit<ReadingAnnotation, "createdAt">): ReadingProgress {
  const progress = loadReadingProgress(input.articleId);
  const normalized = normalizeAnnotation(input.selectedText);
  const replacement: ReadingAnnotation = { ...input, selectedText: input.selectedText.trim(), createdAt: Date.now() };
  const existingIndex = progress.annotations.findIndex((item) => item.lineId === input.lineId && normalizeAnnotation(item.selectedText) === normalized && item.startIndex === input.startIndex);
  const annotations = existingIndex === -1 ? [...progress.annotations, replacement] : progress.annotations.map((item, index) => index === existingIndex ? replacement : item);
  const next = { ...progress, annotations, lastOpenedAt: Date.now() };
  saveProgress(input.articleId, next);
  return next;
}

export function removeAnnotation(articleId: string, lineId: string, selectedText: string, startIndex?: number): ReadingProgress {
  const progress = loadReadingProgress(articleId);
  const target = normalizeAnnotation(selectedText);
  const next = { ...progress, annotations: progress.annotations.filter((item) => item.lineId !== lineId || normalizeAnnotation(item.selectedText) !== target || (startIndex !== undefined && item.startIndex !== startIndex)), lastOpenedAt: Date.now() };
  saveProgress(articleId, next);
  return next;
}

export function saveLastReadingArticle(articleId: string) {
  workspaceStorage.setItem(lastArticleKey, articleId);
}

export function loadLastReadingArticle() {
  return workspaceStorage.getItem(lastArticleKey);
}

export function loadReadingReports(): ReadingReport[] {
  try {
    const saved = JSON.parse(workspaceStorage.getItem(reportsKey) ?? "") as unknown;
    if (!Array.isArray(saved)) return [];
    return saved.filter(isReadingReport).sort((a, b) => b.completedAt - a.completedAt);
  } catch { /* invalid data below */ }
  return [];
}

export function saveReadingReport(input: ReadingReport): ReadingReport[] {
  const snapshot: ReadingReport = {
    article: { ...input.article },
    summary: input.summary,
    summaryEvaluation: input.summaryEvaluation ? { ...input.summaryEvaluation, strengths: [...input.summaryEvaluation.strengths], improvements: [...input.summaryEvaluation.improvements] } : undefined,
    annotations: input.annotations.map((annotation) => ({ ...annotation })),
    completedAt: input.completedAt,
  };
  const reports = [snapshot, ...loadReadingReports()]
    .sort((a, b) => b.completedAt - a.completedAt)
    .slice(0, 30);
  workspaceStorage.setItem(reportsKey, JSON.stringify(reports));
  return reports;
}

export function nextReadingArticleId(articles: ReadingArticle[], articleId: string): string | null {
  if (!articles.length) return null;
  const index = articles.findIndex((article) => article.id === articleId);
  return articles[index < 0 ? 0 : (index + 1) % articles.length].id;
}

export function completeReadingGroup({ articles, article, progress, completedAt }: CompleteReadingGroupInput): { nextArticleId: string | null } {
  saveReadingReport({ article, summary: progress.summary, summaryEvaluation: progress.summaryEvaluation, annotations: progress.annotations, completedAt });
  return { nextArticleId: nextReadingArticleId(articles, article.id) };
}

function emptyProgress(): ReadingProgress {
  return { summary: "", annotations: [], lastOpenedAt: 0 };
}

function loadProgressMap(): Record<string, ReadingProgress> {
  try {
    const saved = JSON.parse(workspaceStorage.getItem(progressKey) ?? "") as unknown;
    if (saved && typeof saved === "object" && !Array.isArray(saved)) return saved as Record<string, ReadingProgress>;
  } catch { /* empty map below */ }
  return {};
}

function saveProgress(articleId: string, progress: ReadingProgress) {
  workspaceStorage.setItem(progressKey, JSON.stringify({ ...loadProgressMap(), [articleId]: progress }));
}

function normalizeAnnotation(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function annotationIndex(lowerText: string, annotation: ReadingAnnotation) {
  const selected = annotation.selectedText.toLocaleLowerCase();
  if (typeof annotation.startIndex === "number" && lowerText.slice(annotation.startIndex, annotation.startIndex + selected.length) === selected) return annotation.startIndex;
  return lowerText.indexOf(selected);
}

function isReadingReport(value: unknown): value is ReadingReport {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const report = value as Partial<ReadingReport>;
  return Boolean(
    report.article && typeof report.article.id === "string" && typeof report.article.title === "string"
    && typeof report.article.content === "string" && typeof report.summary === "string"
    && (report.summaryEvaluation === undefined || isReadingSummaryEvaluation(report.summaryEvaluation))
    && Array.isArray(report.annotations) && typeof report.completedAt === "number",
  );
}

function isReadingSummaryEvaluation(value: unknown): value is ReadingSummaryEvaluation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const evaluation = value as Partial<ReadingSummaryEvaluation>;
  return typeof evaluation.score === "number" && typeof evaluation.feedback === "string"
    && Array.isArray(evaluation.strengths) && evaluation.strengths.every((item) => typeof item === "string")
    && Array.isArray(evaluation.improvements) && evaluation.improvements.every((item) => typeof item === "string");
}



