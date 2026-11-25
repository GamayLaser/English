import { workspaceStorage } from "../persistence/privateWorkspaceStore";
import { GREETINGS_LISTENING } from "../english/greetingsCourseContent";

import type { ImportListeningResult, ListeningArticle } from "../english/types";

const key = "english:listening-library-v2";

export const DEFAULT_LISTENING_ARTICLES: ListeningArticle[] = GREETINGS_LISTENING.map(([title, content], index) => ({
  id: `greetings-listening-${index + 1}`,
  title,
  content,
  source: "built-in",
}));

const norm = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();

export function loadListeningLibrary() {
  try {
    const saved = JSON.parse(workspaceStorage.getItem(key) ?? "") as unknown;
    if (Array.isArray(saved)) return [...DEFAULT_LISTENING_ARTICLES, ...saved.filter((item): item is ListeningArticle => Boolean(item && typeof item === "object" && (item as ListeningArticle).source === "imported"))];
  } catch { /* defaults below */ }
  return DEFAULT_LISTENING_ARTICLES;
}

export function saveListeningLibrary(items: ListeningArticle[]) {
  workspaceStorage.setItem(key, JSON.stringify(items));
}

export async function importListeningWorkbook(buffer: ArrayBuffer, existing: ListeningArticle[]): Promise<ImportListeningResult> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("Excel 中没有可读取的工作表。");
  const headers = (XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })[0] ?? []).map(String);
  if (!headers.includes("标题") || !headers.includes("英文听力原文")) throw new Error("Excel 首行必须包含“标题”和“英文听力原文”两列。");
  const known = new Set(existing.map((item) => `${norm(item.title)}|${norm(item.content)}`));
  const result: ImportListeningResult = { added: [], duplicates: 0, invalid: 0 };
  XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" }).forEach((row, index) => {
    const title = String(row["标题"] ?? "").trim();
    const content = String(row["英文听力原文"] ?? "").trim();
    const rowKey = `${norm(title)}|${norm(content)}`;
    if (!title || !content) result.invalid += 1;
    else if (known.has(rowKey)) result.duplicates += 1;
    else {
      known.add(rowKey);
      result.added.push({ id: `listening-import-${Date.now()}-${index}`, title, content, source: "imported" });
    }
  });
  if (!result.added.length) throw new Error("没有可导入的有效听力原文，请检查 Excel 内容。");
  return result;
}



