import { workspaceStorage } from "../persistence/privateWorkspaceStore";

export type NovelChapterMeta = {
  id: string;
  file: string;
  title: string;
  wordCount: number;
  estimatedMinutes?: number;
  volumeTitle?: string;
  chapterIndex?: number;
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
const BOOK_CHAPTER_PREFIX = /^Book (?:One|Two|Three) · Chapter \d+:\s*/i;

function stripBookChapterPrefix(title: string): string {
  return title.replace(BOOK_CHAPTER_PREFIX, "").trim() || title;
}

export async function loadNovelIndex(): Promise<NovelIndex> {
  if (indexCache) return indexCache;
  const res = await fetch("/novel-data/index.json");
  if (!res.ok) throw new Error("无法加载小说目录");
  const data = (await res.json()) as NovelIndex;
  for (const volume of data.volumes) {
    for (const chapter of volume.chapters) {
      chapter.title = stripBookChapterPrefix(chapter.title);
    }
  }
  indexCache = data;
  return indexCache;
}

export async function loadNovelChapter(file: string): Promise<NovelChapterContent> {
  const cached = CHAPTER_CACHE.get(file);
  if (cached) return cached;
  const res = await fetch(`/novel-data/chapters/${file}`);
  if (!res.ok) throw new Error("无法加载章节内容");
  const data = (await res.json()) as NovelChapterContent;
  data.title = stripBookChapterPrefix(data.title);
  CHAPTER_CACHE.set(file, data);
  return data;
}

export function loadLastNovelChapterId(): string | null {
  return workspaceStorage.getItem(LAST_NOVEL_CHAPTER_KEY);
}

export function saveLastNovelChapterId(id: string): void {
  workspaceStorage.setItem(LAST_NOVEL_CHAPTER_KEY, id);
}
