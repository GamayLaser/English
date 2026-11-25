import { workspaceStorage } from "../persistence/privateWorkspaceStore";
import { GREETINGS_TRANSLATIONS } from "./greetingsCourseContent";

import type { ImportResult, Sentence } from "./types";

const LIBRARY_KEY = "english:sentence-library-v2";

export const DEFAULT_ELEMENTARY_SENTENCES: Sentence[] = GREETINGS_TRANSLATIONS.map(([en, zh], index) => ({
  id: `greetings-translation-${index + 1}`,
  en,
  zh,
  source: "built-in",
}));

export function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function loadSentenceLibrary() {
  try {
    const saved = JSON.parse(workspaceStorage.getItem(LIBRARY_KEY) ?? "") as unknown;
    if (Array.isArray(saved) && saved.every(isSentence)) return saved;
  } catch { /* seed below */ }
  return DEFAULT_ELEMENTARY_SENTENCES;
}

export function saveSentenceLibrary(sentences: Sentence[]) {
  workspaceStorage.setItem(LIBRARY_KEY, JSON.stringify(sentences));
}

export async function importWorkbook(buffer: ArrayBuffer, existing: Sentence[]): Promise<ImportResult> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("Excel 中没有可读取的工作表。");
  const headerRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
  const headers = headerRows[0]?.map((cell) => String(cell).trim()) ?? [];
  if (!headers.includes("英文") || !headers.includes("中文")) throw new Error("Excel 首行必须包含“英文”和“中文”两列。");
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const known = new Set(existing.map((item) => pairKey(item.en, item.zh)));
  const result: ImportResult = { added: [], duplicates: 0, invalid: 0 };
  rows.forEach((row, index) => {
    const en = String(row["英文"] ?? "").trim();
    const zh = String(row["中文"] ?? "").trim();
    if (!en || !zh) { result.invalid += 1; return; }
    const key = pairKey(en, zh);
    if (known.has(key)) { result.duplicates += 1; return; }
    known.add(key);
    result.added.push({ id: `import-${Date.now()}-${index}`, en, zh, source: "imported" });
  });
  if (result.added.length === 0) throw new Error("没有可导入的有效句子，请检查 Excel 内容。");
  return result;
}

function pairKey(en: string, zh: string) {
  return `${normalize(en)}|${normalize(zh)}`;
}

function isSentence(value: unknown): value is Sentence {
  return Boolean(value && typeof value === "object" && typeof (value as Sentence).id === "string" && typeof (value as Sentence).en === "string" && typeof (value as Sentence).zh === "string");
}



