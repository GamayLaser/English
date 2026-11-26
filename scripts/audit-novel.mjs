import fs from "node:fs";
import path from "node:path";

const NOVEL_DIR = path.resolve(process.cwd(), "public", "novel-data");
const INDEX_PATH = path.join(NOVEL_DIR, "index.json");

function countWords(text) {
  return (text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) ?? []).length;
}

const index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));
const titleMap = new Map();
const slugMap = new Map();
let totalChapters = 0;

for (const vol of index.volumes) {
  let chapterIndex = 0;
  for (const meta of vol.chapters) {
    chapterIndex++;
    totalChapters++;
    const filePath = path.join(NOVEL_DIR, "chapters", meta.file);
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

    const wordCount = countWords(data.story || "");
    const estimatedMinutes = Math.max(1, Math.ceil(wordCount / 130));

    data.wordCount = wordCount;
    data.estimatedMinutes = estimatedMinutes;
    data.volumeTitle = vol.name;
    data.chapterIndex = chapterIndex;
    fs.writeFileSync(filePath, JSON.stringify(data), "utf8");

    meta.wordCount = wordCount;
    meta.estimatedMinutes = estimatedMinutes;
    meta.volumeTitle = vol.name;
    meta.chapterIndex = chapterIndex;

    const normTitle = (data.title || "").replace(/^Book\s+\w+\s*·\s*Chapter\s+\d+:\s*/i, "").trim().toLowerCase();
    const titleArr = titleMap.get(normTitle) ?? [];
    titleArr.push({ file: meta.file, title: data.title, wordCount, storyHead: (data.story || "").slice(0, 80) });
    titleMap.set(normTitle, titleArr);

    const slug = path.basename(meta.file, ".json").replace(/^\d+-/, "").toLowerCase();
    const slugArr = slugMap.get(slug) ?? [];
    slugArr.push({ file: meta.file, title: data.title, wordCount, story: data.story || "" });
    slugMap.set(slug, slugArr);
  }
}

fs.writeFileSync(INDEX_PATH, JSON.stringify(index), "utf8");

console.log(`=== Novel Audit Report (${totalChapters} chapters across ${index.volumes.length} volumes) ===`);
const dupTitles = [...titleMap.entries()].filter(([, arr]) => arr.length > 1);
console.log(`Duplicate short titles found: ${dupTitles.length}`);
for (const [key, arr] of dupTitles) {
  console.log(`  - "${key}": ${arr.map((a) => `${a.file} (${a.wordCount}w)`).join(" | ")}`);
}

const dupSlugs = [...slugMap.entries()].filter(([, arr]) => arr.length > 1);
console.log(`Duplicate filename slugs found: ${dupSlugs.length}`);
for (const [slug, arr] of dupSlugs) {
  const identical = arr.every((a) => a.story === arr[0].story);
  console.log(`  - slug "${slug}": ${arr.map((a) => `${a.file} (${a.wordCount}w)`).join(" | ")} -> content ${identical ? "IDENTICAL" : "DISTINCT"}`);
}
