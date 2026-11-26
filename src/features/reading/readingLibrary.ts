import { workspaceStorage } from "../persistence/privateWorkspaceStore";

import type { ImportReadingResult, ReadingArticle } from "../english/types";

const libraryKey = "english:reading-library-v2";

export const DEFAULT_ELEMENTARY_ARTICLES: ReadingArticle[] = [];

export function normalizeReadingText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function loadReadingLibrary() {
  try {
    const saved = JSON.parse(workspaceStorage.getItem(libraryKey) ?? "") as unknown;
    if (Array.isArray(saved) && saved.every(isReadingArticle)) {
      const cleaned = saved.filter((item) => item.source === "imported");
      if (cleaned.length !== saved.length) saveReadingLibrary(cleaned);
      return cleaned;
    }
  } catch { /* seed below */ }
  return DEFAULT_ELEMENTARY_ARTICLES;
}

export function saveReadingLibrary(articles: ReadingArticle[]) {
  workspaceStorage.setItem(libraryKey, JSON.stringify(articles));
}

export async function importReadingWorkbook(buffer: ArrayBuffer, existing: ReadingArticle[]): Promise<ImportReadingResult> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("Excel 中没有可读取的工作表。");
  const headerRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
  const headers = headerRows[0]?.map((cell) => String(cell).trim()) ?? [];
  if (!headers.includes("标题") || !headers.includes("英文内容")) throw new Error("Excel 首行必须包含“标题”和“英文内容”两列。");
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const known = new Set(existing.map((article) => articleKey(article.title, article.content)));
  const result: ImportReadingResult = { added: [], duplicates: 0, invalid: 0 };
  rows.forEach((row, index) => {
    const title = String(row["标题"] ?? "").trim();
    const content = String(row["英文内容"] ?? "").trim();
    if (!title || !content) { result.invalid += 1; return; }
    const key = articleKey(title, content);
    if (known.has(key)) { result.duplicates += 1; return; }
    known.add(key);
    result.added.push({ id: `reading-import-${Date.now()}-${index}`, title, content, source: "imported" });
  });
  if (result.added.length === 0) throw new Error("没有可导入的有效文章，请检查 Excel 内容。");
  return result;
}

function articleKey(title: string, content: string) {
  return `${normalizeReadingText(title)}|${normalizeReadingText(content)}`;
}

function upgradeBuiltInArticles(articles: ReadingArticle[]) {
  const defaultIds = new Set(DEFAULT_ELEMENTARY_ARTICLES.map((article) => article.id));
  const extras = articles.filter((article) => article.source === "imported" || !defaultIds.has(article.id));
  return [...DEFAULT_ELEMENTARY_ARTICLES, ...extras];
}

function isReadingArticle(value: unknown): value is ReadingArticle {
  return Boolean(value && typeof value === "object" && typeof (value as ReadingArticle).id === "string" && typeof (value as ReadingArticle).title === "string" && typeof (value as ReadingArticle).content === "string" && ((value as ReadingArticle).source === "built-in" || (value as ReadingArticle).source === "imported"));
}



