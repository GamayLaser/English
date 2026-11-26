import { workspaceStorage } from "../persistence/privateWorkspaceStore";

export type NovelChapterMeta = {
  id: string;
  file: string;
  title: string;
  wordCount: number;
};

export type NovelVolumeMeta = {
  id: string;
  name: string;
  chapters: NovelChapterMeta[];
};

export type NovelIndex = {
  volumes: NovelVolumeMeta[];
};

export type NovelChapterContent = {
  id: string;
  volumeId: string;
  title: string;
  wordCount: number;
  story: string;
  studyGuide: string;
};

const LAST_NOVEL_CHAPTER_KEY = "english:last-novel-chapter-v1";
const CHAPTER_CACHE = new Map<string, NovelChapterContent>();
let indexCache: NovelIndex | null = null;

export async function loadNovelIndex(): Promise<NovelIndex> {
  if (indexCache) return indexCache;
  const res = await fetch("/novel-data/index.json");
  if (!res.ok) throw new Error("无法加载小说目录");
  indexCache = (await res.json()) as NovelIndex;
  return indexCache;
}

export async function loadNovelChapter(file: string): Promise<NovelChapterContent> {
  const cached = CHAPTER_CACHE.get(file);
  if (cached) return cached;
  const res = await fetch(`/novel-data/chapters/${file}`);
  if (!res.ok) throw new Error("无法加载章节内容");
  const data = (await res.json()) as NovelChapterContent;
  CHAPTER_CACHE.set(file, data);
  return data;
}

export function loadLastNovelChapterId(): string | null {
  return workspaceStorage.getItem(LAST_NOVEL_CHAPTER_KEY);
}

export function saveLastNovelChapterId(id: string): void {
  workspaceStorage.setItem(LAST_NOVEL_CHAPTER_KEY, id);
}
