/**
 * Clean and normalize SRT subtitle files in-place:
 *  1. Strip HTML/ASS formatting tags (<...>, {...})
 *  2. Remove leading speaker-turn dashes ("- ", "– ", "— ")
 *  3. Remove SDH speaker-name prefixes ("Adult Sheldon:", "Mary:", "Man 1:")
 *  4. Drop pure OCR music-note lines ("J'j'", "Jj", "J'j'j'j'", "♪", "♫")
 *  5. Normalize OCR music-note "J ... J" lyrics to "♪ ..."
 *  6. Merge split mid-sentence cues into complete sentences (gap <= 1.2s)
 *  7. Re-number cue indices 1..N
 *
 * Usage:
 *   node scripts/clean-srt.mjs                  # cleans all public/shows/*.srt
 *   node scripts/clean-srt.mjs path/to/file.srt # cleans specific file(s) or folder
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SHOWS_DIR = path.resolve(__dirname, "../public/shows");
const CJK_RE = /[\u4e00-\u9fff]/;
const TERMINAL_PUNCT_RE = /[.!?…]["”'’)\]]*$/;

function parseTimestamp(raw) {
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

function formatSrtTimestamp(sec) {
  const totalMs = Math.max(0, Math.round(sec * 1000));
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60);
  return (
    `${String(h).padStart(2, "0")}:` +
    `${String(m).padStart(2, "0")}:` +
    `${String(s).padStart(2, "0")},` +
    `${String(ms).padStart(3, "0")}`
  );
}

function cleanLine(line) {
  let cleaned = line.replace(/<[^>]+>/g, "").replace(/\{[^}]+\}/g, "").trim();
  cleaned = cleaned.replace(/^[-–—]\s+/, "").trim();
  cleaned = cleaned
    .replace(/^(?:[A-Z][A-Za-z.'-]*)(?:\s+[A-Z0-9][A-Za-z0-9.'-]*){0,2}:\s*/, "")
    .trim();
  if (!cleaned || /^[Jj'’"“”\s♪♫]+$/.test(cleaned)) return "";

  const hadMusic =
    /^[Jj]["“”'’]?\s+/.test(cleaned) ||
    /\s+[Jj]["“”'’]?$/.test(cleaned) ||
    /[♪♫]/.test(cleaned);
  cleaned = cleaned
    .replace(/[♪♫]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:[Jj]["“”'’]?\s+)+/, "")
    .replace(/(?:\s+[Jj]["“”'’]?)+$/, "")
    .trim();
  if (hadMusic && cleaned) {
    cleaned = cleaned.replace(/\s+[Jj]["“”'’]?(?=\s)/g, "");
    cleaned = `♪ ${cleaned}`;
  }
  return cleaned;
}

export function cleanSrtContent(content) {
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";

  const blocks = normalized.replace(/^WEBVTT[^\n]*\n+/i, "").split(/\n{2,}/);
  const rawCues = [];

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) continue;

    const timeIdx = lines.findIndex((l) => l.includes("-->"));
    if (timeIdx === -1) continue;

    const [startRaw, endRawWithSettings] = lines[timeIdx].split("-->");
    if (!startRaw || !endRawWithSettings) continue;

    const startSec = parseTimestamp(startRaw);
    const endSec = parseTimestamp(endRawWithSettings.trim().split(/\s+/)[0] ?? "");
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) continue;

    const textLines = lines.slice(timeIdx + 1).map(cleanLine).filter(Boolean);
    if (!textLines.length) continue;

    const enParts = [];
    const zhParts = [];
    for (const line of textLines) {
      if (CJK_RE.test(line)) zhParts.push(line);
      else enParts.push(line);
    }

    rawCues.push({
      startSec,
      endSec,
      en: enParts.join(" ") || textLines.join(" "),
      zh: zhParts.join(" "),
    });
  }

  const merged = [];
  for (const curr of rawCues) {
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
    } else {
      merged.push({ ...curr });
    }
  }

  return (
    merged
      .map((cue, idx) => {
        const body = cue.zh ? `${cue.en}\n${cue.zh}` : cue.en;
        return `${idx + 1}\n${formatSrtTimestamp(cue.startSec)} --> ${formatSrtTimestamp(cue.endSec)}\n${body}`;
      })
      .join("\n\n") + "\n"
  );
}

function collectSrtTargets(args) {
  const targets = args.length ? args.map((a) => path.resolve(a)) : [DEFAULT_SHOWS_DIR];
  const files = [];
  for (const target of targets) {
    if (!fs.existsSync(target)) continue;
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(target)) {
        if (name.toLowerCase().endsWith(".srt")) {
          files.push(path.join(target, name));
        }
      }
    } else if (target.toLowerCase().endsWith(".srt")) {
      files.push(target);
    }
  }
  return files.sort();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const files = collectSrtTargets(process.argv.slice(2));
  if (!files.length) {
    console.log("No .srt files found.");
    process.exit(0);
  }
  for (const file of files) {
    const before = fs.readFileSync(file, "utf8");
    const after = cleanSrtContent(before);
    fs.writeFileSync(file, after, "utf8");
    const cueCount = (after.match(/-->/g) || []).length;
    console.log(`Cleaned ${path.basename(file)} => ${cueCount} cues`);
  }
}
