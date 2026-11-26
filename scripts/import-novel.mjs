import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "..");
const NOVEL_DIR = path.join(ROOT, "小说正文");
const OUT_DIR = path.resolve(process.cwd(), "public", "novel-data");

const VOLUMES = [
  { dir: "第一卷", id: "vol-1", name: "第一卷 · 入门启程" },
  { dir: "第二卷", id: "vol-2", name: "第二卷 · 日常进阶" },
  { dir: "第三卷", id: "vol-3", name: "第三卷 · 流利成长" },
];

function countWords(text) {
  return (text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) ?? []).length;
}

function parseChapter(raw, filename) {
  const normalized = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const headingMatch = normalized.match(/^##\s+(.+)$/m);
  const title = headingMatch ? headingMatch[1].trim() : filename.replace(/\.md$/, "");

  const startMarker = "<!-- STORY_START -->";
  const endMarker = "<!-- STORY_END -->";
  const startIdx = normalized.indexOf(startMarker);
  const endIdx = normalized.indexOf(endMarker);

  let story = "";
  let studyGuide = "";

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    story = normalized.slice(startIdx + startMarker.length, endIdx).trim();
    studyGuide = normalized.slice(endIdx + endMarker.length).trim();
  } else {
    story = normalized.trim();
  }

  return { title, story, studyGuide, wordCount: countWords(story) };
}

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const index = { volumes: [] };
let totalChapters = 0;

for (const vol of VOLUMES) {
  const volPath = path.join(NOVEL_DIR, vol.dir);
  if (!fs.existsSync(volPath)) continue;

  const files = fs
    .readdirSync(volPath)
    .filter((f) => f.endsWith(".md"))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

  const outVolDir = path.join(OUT_DIR, "chapters", vol.id);
  fs.mkdirSync(outVolDir, { recursive: true });

  const chapters = [];
  const usedIds = new Set();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const raw = fs.readFileSync(path.join(volPath, file), "utf8");
    const parsed = parseChapter(raw, file);

    let baseId = file.replace(/\.md$/, "");
    if (usedIds.has(baseId)) baseId = `${baseId}-${i + 1}`;
    usedIds.add(baseId);

    const chapterData = {
      id: `${vol.id}/${baseId}`,
      volumeId: vol.id,
      title: parsed.title,
      wordCount: parsed.wordCount,
      story: parsed.story,
      studyGuide: parsed.studyGuide,
    };

    fs.writeFileSync(
      path.join(outVolDir, `${baseId}.json`),
      JSON.stringify(chapterData),
      "utf8",
    );

    chapters.push({
      id: chapterData.id,
      file: `${vol.id}/${baseId}.json`,
      title: parsed.title,
      wordCount: parsed.wordCount,
    });
    totalChapters++;
  }

  index.volumes.push({
    id: vol.id,
    name: vol.name,
    chapters,
  });
}

fs.writeFileSync(path.join(OUT_DIR, "index.json"), JSON.stringify(index), "utf8");
console.log(`Imported ${totalChapters} chapters across ${index.volumes.length} volumes into ${OUT_DIR}`);
