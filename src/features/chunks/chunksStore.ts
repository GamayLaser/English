import { workspaceStorage } from "../persistence/privateWorkspaceStore";

export type ChunkSource = "reading" | "novel" | "shows" | "translator";

export type UserChunk = {
  id: string;
  en: string;
  zh: string;
  context?: string;
  source: ChunkSource;
  createdAt: number;
  mastered: boolean;
};

const CHUNKS_KEY = "english:my-chunks-v1";

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
    return Array.isArray(parsed) ? (parsed as UserChunk[]) : [];
  } catch {
    return [];
  }
}

export function saveUserChunks(chunks: UserChunk[]): void {
  workspaceStorage.setItem(CHUNKS_KEY, JSON.stringify(chunks.slice(0, 500)));
  notifyUpdated();
}

export function addUserChunk(input: {
  en: string;
  zh: string;
  context?: string;
  source: ChunkSource;
}): UserChunk[] {
  const en = input.en.trim();
  const zh = input.zh.trim();
  if (!en) return loadUserChunks();

  const existing = loadUserChunks();
  const normalized = en.toLowerCase();
  const filtered = existing.filter((c) => c.en.toLowerCase() !== normalized);
  const next: UserChunk = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    en,
    zh,
    context: input.context?.trim() || undefined,
    source: input.source,
    createdAt: Date.now(),
    mastered: false,
  };
  const updated = [next, ...filtered];
  saveUserChunks(updated);
  return updated;
}

export function toggleUserChunkMastered(id: string): UserChunk[] {
  const updated = loadUserChunks().map((c) =>
    c.id === id ? { ...c, mastered: !c.mastered } : c,
  );
  saveUserChunks(updated);
  return updated;
}

export function removeUserChunk(id: string): UserChunk[] {
  const updated = loadUserChunks().filter((c) => c.id !== id);
  saveUserChunks(updated);
  return updated;
}
