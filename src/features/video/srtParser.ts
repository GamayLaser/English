export type SubtitleCue = {
  id: string;
  index: number;
  startSec: number;
  endSec: number;
  en: string;
  zh: string;
  raw: string;
};

function parseTimestamp(raw: string): number {
  const cleaned = raw.trim().replace(",", ".");
  const parts = cleaned.split(":");
  if (parts.length === 3) {
    return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  }
  if (parts.length === 2) {
    return Number(parts[0]) * 60 + Number(parts[1]);
  }
  return Number(cleaned) || 0;
}

function stripTags(line: string): string {
  let cleaned = line.replace(/<[^>]+>/g, "").replace(/\{[^}]+\}/g, "").trim();
  // Remove speaker-turn leading dashes (e.g. "- And raise you a quarter.")
  cleaned = cleaned.replace(/^[-–—]\s+/, "").trim();
  // Remove SDH speaker labels (e.g. "Adult Sheldon:", "Mary:", "Man 1:")
  cleaned = cleaned
    .replace(/^(?:[A-Z][A-Za-z.'-]*)(?:\s+[A-Z0-9][A-Za-z0-9.'-]*){0,2}:\s*/, "")
    .trim();
  // Drop pure OCR music-note cues without lyrics (e.g. "J'j'", "Jj", "J'j'j'j'")
  if (/^[Jj'’"“”\s♪♫]+$/.test(cleaned)) return "";
  // BluRay/DVD OCR often misreads music note ♪ as standalone leading/trailing J or j
  const hasLeadingMusicJ = /^J["“”']?\s+/.test(cleaned);
  const hasTrailingMusicJ = /\s+[Jj]["“”']?$/.test(cleaned);
  if (hasLeadingMusicJ || hasTrailingMusicJ) {
    cleaned = cleaned
      .replace(/^J["“”']?\s+/, "")
      .replace(/\s+[Jj]["“”']?$/, "")
      .trim();
    if (cleaned) cleaned = `♪ ${cleaned}`;
  }
  return cleaned;
}

const CJK_RE = /[\u4e00-\u9fff]/;

const TERMINAL_PUNCT_RE = /[.!?…]["”'’)\]]*$/;

function mergeSentenceCues(cues: SubtitleCue[]): SubtitleCue[] {
  if (cues.length <= 1) return cues;
  const merged: SubtitleCue[] = [];

  for (const curr of cues) {
    const prev = merged[merged.length - 1];
    const gap = prev ? curr.startSec - prev.endSec : Infinity;
    const isMusic = prev ? prev.en.startsWith("♪") || curr.en.startsWith("♪") : false;
    const shouldMerge =
      Boolean(prev) &&
      !isMusic &&
      gap <= 1.2 &&
      !TERMINAL_PUNCT_RE.test(prev.en.trim()) &&
      prev.en.length + curr.en.length <= 220;

    if (prev && shouldMerge) {
      prev.endSec = Math.max(prev.endSec, curr.endSec);
      prev.en = `${prev.en.trim()} ${curr.en.trim()}`;
      if (prev.zh && curr.zh) prev.zh = `${prev.zh.trim()} ${curr.zh.trim()}`;
      else if (curr.zh) prev.zh = curr.zh;
      prev.raw = `${prev.raw}\n${curr.raw}`;
    } else {
      merged.push({ ...curr });
    }
  }

  return merged.map((cue, idx) => ({
    ...cue,
    index: idx + 1,
    id: `${idx + 1}-${cue.startSec.toFixed(2)}`,
  }));
}

export function parseSubtitles(content: string): SubtitleCue[] {
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];

  const blocks = normalized
    .replace(/^WEBVTT[^\n]*\n+/i, "")
    .split(/\n{2,}/);

  const cues: SubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) continue;

    const timeLineIdx = lines.findIndex((l) => l.includes("-->"));
    if (timeLineIdx === -1) continue;

    const timeLine = lines[timeLineIdx];
    const [startRaw, endRawWithSettings] = timeLine.split("-->");
    if (!startRaw || !endRawWithSettings) continue;

    const startSec = parseTimestamp(startRaw);
    const endSec = parseTimestamp(endRawWithSettings.trim().split(/\s+/)[0] ?? "");
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) continue;

    const textLines = lines
      .slice(timeLineIdx + 1)
      .map(stripTags)
      .filter(Boolean);
    if (!textLines.length) continue;

    const enParts: string[] = [];
    const zhParts: string[] = [];
    for (const line of textLines) {
      if (CJK_RE.test(line)) zhParts.push(line);
      else enParts.push(line);
    }

    cues.push({
      id: `${cues.length + 1}-${startSec.toFixed(2)}`,
      index: cues.length + 1,
      startSec,
      endSec,
      en: enParts.join(" ") || textLines.join(" "),
      zh: zhParts.join(" "),
      raw: textLines.join("\n"),
    });
  }

  return mergeSentenceCues(cues);
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
}
