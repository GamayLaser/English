import { workspaceStorage } from "../persistence/privateWorkspaceStore";

export type ChunkSource = "reading" | "novel" | "shows" | "show" | "card" | "translator";

const MAX_USER_CHUNKS = 1000;

function normalizeSource(source: ChunkSource): ChunkSource {
  return source === "show" ? "shows" : source;
}

export type UserChunk = {
  id: string;
  en: string;
  zh: string;
  context?: string;
  source: ChunkSource;
  sourceRef?: string;
  createdAt: number;
  mastered: boolean;
  masteryLevel?: number;
  nextReviewAt?: number;
  reviewCount?: number;
};

const CHUNKS_KEY = "english:my-chunks-v1";
const DAY_MS = 86_400_000;
const INTERVAL_DAYS = [0.5, 1, 3, 7, 14, 30];

function notifyUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("workspace:stats-updated"));
  }
}

export function loadUserChunks(): UserChunk[] {
  try {
    const raw = workspaceStorage.getItem(CHUNKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? (parsed as UserChunk[]).map((c) => ({ ...c, source: normalizeSource(c.source) }))
      : [];
  } catch {
    return [];
  }
}

export function saveUserChunks(chunks: UserChunk[]): void {
  workspaceStorage.setItem(CHUNKS_KEY, JSON.stringify(chunks.slice(0, MAX_USER_CHUNKS)));
  notifyUpdated();
}

export function addUserChunk(input: {
  en: string;
  zh: string;
  context?: string;
  source: ChunkSource;
  sourceRef?: string;
}): UserChunk[] {
  const en = input.en.trim();
  const zh = input.zh.trim();
  if (!en) return loadUserChunks();

  const existing = loadUserChunks();
  const normalized = en.toLowerCase();
  const prev = existing.find((c) => c.en.toLowerCase() === normalized);
  const filtered = existing.filter((c) => c.en.toLowerCase() !== normalized);
  const now = Date.now();
  const next: UserChunk = {
    id: prev?.id ?? `${now}-${Math.random().toString(36).slice(2, 7)}`,
    en,
    zh: zh || prev?.zh || "",
    context: input.context?.trim() || prev?.context,
    source: normalizeSource(input.source),
    sourceRef: input.sourceRef || prev?.sourceRef,
    createdAt: prev?.createdAt ?? now,
    mastered: prev?.mastered ?? false,
    masteryLevel: prev?.masteryLevel ?? 0,
    nextReviewAt: prev?.nextReviewAt ?? now,
    reviewCount: prev?.reviewCount ?? 0,
  };
  const updated = [next, ...filtered];
  saveUserChunks(updated);
  return updated;
}

export function getDueUserChunks(now = Date.now()): UserChunk[] {
  return loadUserChunks().filter(
    (c) => !c.mastered && (c.nextReviewAt ?? 0) <= now,
  );
}

export function recordUserChunkReview(id: string, passed: boolean, now = Date.now()): UserChunk[] {
  const updated = loadUserChunks().map((c) => {
    if (c.id !== id) return c;
    const prevLevel = c.masteryLevel ?? 0;
    const nextLevel = passed ? Math.min(5, prevLevel + 1) : 0;
    const days = INTERVAL_DAYS[nextLevel] ?? 1;
    return {
      ...c,
      masteryLevel: nextLevel,
      reviewCount: (c.reviewCount ?? 0) + 1,
      nextReviewAt: now + days * DAY_MS,
      mastered: nextLevel >= 5,
    };
  });
  saveUserChunks(updated);
  return updated;
}

export function toggleUserChunkMastered(id: string): UserChunk[] {
  const updated = loadUserChunks().map((c) =>
    c.id === id ? { ...c, mastered: !c.mastered, masteryLevel: !c.mastered ? 5 : 1 } : c,
  );
  saveUserChunks(updated);
  return updated;
}

export function removeUserChunk(id: string): UserChunk[] {
  const updated = loadUserChunks().filter((c) => c.id !== id);
  saveUserChunks(updated);
  return updated;
}
