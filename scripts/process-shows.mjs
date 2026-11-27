/**
 * Standard show-ingestion pipeline:
 *  1. Scans a source folder for video files (.mkv/.mp4/.mov/.webm)
 *  2. Extracts embedded text subtitles (or uses same-name external .srt)
 *  3. Runs cleanSrtContent() (strips dashes, speaker colons, OCR music J artifacts, merges split sentences)
 *  4. Transcodes video to 720p H.264 + AAC stereo +faststart MP4 (<400 MB) into public/shows/
 *
 * Usage:
 *   npm run shows:process -- "D:\path\to\Season1"
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanSrtContent } from "./clean-srt.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOWS_META_DIR = path.resolve(__dirname, "../public/shows");
const SHOWS_VIDEO_DIR = path.resolve(__dirname, "../local-media/shows");
const VIDEO_EXT = new Set([".mkv", ".mp4", ".mov", ".webm", ".m4v"]);

function detectEncoder() {
  for (const enc of ["h264_qsv", "h264_nvenc", "h264_amf"]) {
    const probe = spawnSync(
      "ffmpeg",
      ["-v", "error", "-f", "lavfi", "-i", "color=c=black:s=1280x720:d=0.2", "-c:v", enc, "-f", "null", "-"],
      { stdio: "ignore" },
    );
    if (probe.status === 0) return enc;
  }
  return "libx264";
}

const srcArg = process.argv[2];
if (!srcArg) {
  console.error("Usage: node scripts/process-shows.mjs <source-folder>");
  process.exit(1);
}

const srcDir = path.resolve(srcArg);
if (!fs.existsSync(srcDir)) {
  console.error(`Source folder not found: ${srcDir}`);
  process.exit(1);
}

fs.mkdirSync(SHOWS_META_DIR, { recursive: true });
fs.mkdirSync(SHOWS_VIDEO_DIR, { recursive: true });
const encoder = detectEncoder();
console.log(`Using H.264 encoder: ${encoder}`);

const entries = fs
  .readdirSync(srcDir)
  .filter((name) => VIDEO_EXT.has(path.extname(name).toLowerCase()))
  .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

for (const file of entries) {
  const stem = file.slice(0, -path.extname(file).length);
  const inputPath = path.join(srcDir, file);
  const outVideo = path.join(SHOWS_VIDEO_DIR, `${stem}.mp4`);
  const outSrt = path.join(SHOWS_META_DIR, `${stem}.srt`);
  const externalSrt = path.join(srcDir, `${stem}.srt`);

  if (fs.existsSync(externalSrt)) {
    fs.writeFileSync(outSrt, cleanSrtContent(fs.readFileSync(externalSrt, "utf8")), "utf8");
    console.log(`[SRT] Cleaned external ${stem}.srt`);
  } else {
    const probeSub = spawnSync(
      "ffprobe",
      ["-v", "error", "-select_streams", "s:0", "-show_entries", "stream=codec_name", "-of", "csv=p=0", inputPath],
      { encoding: "utf8" },
    );
    const subCodec = (probeSub.stdout || "").trim();
    if (subCodec && subCodec !== "hdmv_pgs_subtitle" && subCodec !== "dvd_subtitle") {
      execFileSync("ffmpeg", ["-y", "-v", "error", "-i", inputPath, "-map", "0:s:0", outSrt], { stdio: "inherit" });
      fs.writeFileSync(outSrt, cleanSrtContent(fs.readFileSync(outSrt, "utf8")), "utf8");
      console.log(`[SRT] Extracted & cleaned embedded ${stem}.srt`);
    } else {
      console.log(`[SRT] No text subtitle stream in ${file}; skipping SRT.`);
    }
  }

  console.log(`[Video] Encoding ${stem}.mp4 ...`);
  execFileSync(
    "ffmpeg",
    [
      "-y", "-v", "error", "-i", inputPath,
      "-map", "0:v:0", "-map", "0:a:0",
      "-vf", "scale=-2:720",
      "-c:v", encoder,
      "-g", "24", "-keyint_min", "24",
      "-b:v", "1500k", "-maxrate", "2000k", "-bufsize", "3000k",
      "-c:a", "aac", "-ac", "2", "-b:a", "128k",
      "-movflags", "+faststart", "-sn",
      outVideo,
    ],
    { stdio: "inherit" },
  );
  const mb = (fs.statSync(outVideo).size / (1024 * 1024)).toFixed(2);
  console.log(`[Video] Done ${stem}.mp4 (${mb} MB)`);

  const outPoster = path.join(SHOWS_META_DIR, `${stem}.jpg`);
  spawnSync(
    "ffmpeg",
    ["-y", "-v", "error", "-ss", "00:02:15", "-i", outVideo, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "3", outPoster],
    { stdio: "ignore" },
  );
  if (fs.existsSync(outPoster)) {
    console.log(`[Poster] Extracted ${stem}.jpg`);
  }
}
