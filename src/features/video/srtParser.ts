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
  return line.replace(/<[^>]+>/g, "").replace(/\{[^}]+\}/g, "").trim();
}

const CJK_RE = /[\u4e00-\u9fff]/;

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

  return cues;
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
}
