import type { VocabCategoryMeta, VocabEntry } from "@shared/schemas";
import { workspaceStorage } from "../persistence/privateWorkspaceStore";

export type VocabMode = "word" | "phrase" | "sentence";

const REVIEWED_EXPRESSION_IDS = new Set([
  "next-to",
  "in-front-of",
  "out-of",
  "wash-your-hands",
  "comb-your-hair",
  "brush-your-hair",
  "each-other",
  "no-smoking",
  "no-parking",
]);

export function getEntryMode(item: VocabEntry): VocabMode {
  if (item.entryType === "sentence") return "sentence";
  if (item.cardMode === "word" || item.cardMode === "phrase") return item.cardMode;
  if (/phrase|phr\.|verb pattern/i.test(item.pos || "")) return "phrase";
  return REVIEWED_EXPRESSION_IDS.has(item.id) ? "phrase" : "word";
}

export function dialogueLines(item: VocabEntry): string[] {
  if (item.context && item.context.length) return item.context;
  return String(item.sentence || "")
    .split(/\s+(?=[AB]:)/)
    .filter(Boolean);
}

let indexCache: VocabCategoryMeta[] | null = null;
const categoryCache = new Map<string, VocabEntry[]>();

export async function loadVocabIndex(): Promise<VocabCategoryMeta[]> {
  if (indexCache) return indexCache;
  const res = await fetch("/vocab-data/index.json");
  if (!res.ok) throw new Error("无法加载词库目录");
  indexCache = (await res.json()) as VocabCategoryMeta[];
  return indexCache;
}

export async function loadCategoryEntries(categoryId: string): Promise<VocabEntry[]> {
  const cached = categoryCache.get(categoryId);
  if (cached) return cached;
  const res = await fetch(`/vocab-data/categories/${encodeURIComponent(categoryId)}.json`);
  if (!res.ok) throw new Error(`无法加载分类 ${categoryId}`);
  const list = (await res.json()) as VocabEntry[];
  categoryCache.set(categoryId, list);
  return list;
}

export async function loadAllVocabEntries(categories: VocabCategoryMeta[]): Promise<VocabEntry[]> {
  const lists = await Promise.all(
    categories.filter((c) => c.count > 0).map((c) => loadCategoryEntries(c.id)),
  );
  return lists.flat();
}

export function getCardImageUrl(item: VocabEntry, cdnBaseUrl = ""): string {
  const imageId = item.imageId || item.id;
  const base = cdnBaseUrl.replace(/\/$/, "");
  if (base) return `${base}/${encodeURIComponent(imageId)}.webp`;
  return `/api/media/cards/${encodeURIComponent(imageId)}.webp`;
}

export function speakVocabText(text: string, rate = 1.0): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voices.find((v) => v.lang.startsWith("en-US") && /natural|google|samantha/i.test(v.name)) ||
    voices.find((v) => v.lang.startsWith("en-US")) ||
    voices.find((v) => v.lang.startsWith("en"));
  if (preferred) utterance.voice = preferred;
  utterance.lang = preferred?.lang || "en-US";
  utterance.rate = rate;
  window.speechSynthesis.speak(utterance);
}

const BOOKMARK_KEY = "english:vocab-bookmarked-v1";
const MASTERED_KEY = "english:vocab-mastered-v1";
const SPEED_KEY = "english:vocab-speed-v1";
const MODE_KEY = "english:vocab-mode-v1";

function readSet(key: string): Set<string> {
  try {
    const raw = workspaceStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === "string")) : new Set();
  } catch {
    return new Set();
  }
}

export function loadVocabProgress() {
  const speedRaw = Number(workspaceStorage.getItem(SPEED_KEY) || "1.0");
  const modeRaw = workspaceStorage.getItem(MODE_KEY);
  return {
    bookmarked: readSet(BOOKMARK_KEY),
    mastered: readSet(MASTERED_KEY),
    speed: [0.8, 1.0, 1.2].includes(speedRaw) ? speedRaw : 1.0,
    mode: (modeRaw === "word" || modeRaw === "phrase" || modeRaw === "sentence"
      ? modeRaw
      : "word") as VocabMode,
  };
}

export function saveVocabBookmarks(ids: Set<string>): void {
  workspaceStorage.setItem(BOOKMARK_KEY, JSON.stringify([...ids]));
}

export function saveVocabMastered(ids: Set<string>): void {
  workspaceStorage.setItem(MASTERED_KEY, JSON.stringify([...ids]));
}

export function saveVocabSpeed(speed: number): void {
  workspaceStorage.setItem(SPEED_KEY, String(speed));
}

export function saveVocabMode(mode: VocabMode): void {
  workspaceStorage.setItem(MODE_KEY, mode);
}
