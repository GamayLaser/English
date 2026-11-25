/**
 * Split legacy 卡片/js/data.js (906 KB) into lightweight per-category JSON files.
 *
 * Usage:
 *   npm run split:vocab
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_JS_PATH = path.resolve(__dirname, "../../卡片/js/data.js");
const OUT_DIR = path.resolve(__dirname, "../public/vocab-data");
const CAT_DIR = path.join(OUT_DIR, "categories");

async function main() {
  const source = await readFile(DATA_JS_PATH, "utf8");
  const sandbox = {};
  vm.runInNewContext(
    `${source}\nthis.__EXPORT = { categories: VOCAB_CATEGORIES, words: VOCAB_WORDS };`,
    sandbox,
  );

  const { categories, words } = sandbox.__EXPORT;
  await mkdir(CAT_DIR, { recursive: true });

  const grouped = new Map();
  for (const item of words) {
    const list = grouped.get(item.category) ?? [];
    list.push(item);
    grouped.set(item.category, list);
  }

  const indexMeta = categories.map((cat) => ({
    ...cat,
    count: (grouped.get(cat.id) ?? []).length,
  }));

  await writeFile(path.join(OUT_DIR, "index.json"), JSON.stringify(indexMeta));

  for (const [catId, list] of grouped.entries()) {
    await writeFile(path.join(CAT_DIR, `${catId}.json`), JSON.stringify(list));
  }

  console.log(`Split ${words.length} entries into ${grouped.size} category JSON files at ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
