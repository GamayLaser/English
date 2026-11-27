import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const VIDEO_EXT = new Set([".mp4", ".webm", ".m4v", ".mov"]);
const SUB_EXT = new Set([".srt", ".vtt"]);
const POSTER_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

/** Lists public/shows and pairs each video with a same-name subtitle and poster. */
export function localShowsPlugin(projectRoot: string): Plugin {
  const showsDir = path.resolve(projectRoot, "public/shows");
  return {
    name: "local-shows",
    configureServer(server) {
      server.middlewares.use("/api/shows", (req, res, next) => {
        const pathname = (req.url || "").split("?")[0];
        if (req.method !== "GET" || pathname !== "/") return next();
        fs.mkdirSync(showsDir, { recursive: true });
        const videos = new Map<string, { file: string; size: number }>();
        const subs = new Map<string, string>();
        const posters = new Map<string, string>();
        const crops = new Map<string, number>();
        for (const name of fs.readdirSync(showsDir)) {
          if (name.startsWith(".") || name.includes("/") || name.includes("\\") || name.includes("..")) continue;
          const ext = path.extname(name).toLowerCase();
          const stem = name.slice(0, -ext.length);
          const fullPath = path.join(showsDir, name);
          if (!fs.statSync(fullPath).isFile()) continue;
          if (VIDEO_EXT.has(ext)) videos.set(stem, { file: name, size: fs.statSync(fullPath).size });
          else if (SUB_EXT.has(ext)) subs.set(stem, name);
          else if (POSTER_EXT.has(ext)) posters.set(stem, name);
          else if (ext === ".json") {
            try {
              const meta = JSON.parse(fs.readFileSync(fullPath, "utf8")) as { cropBottom?: number };
              if (typeof meta.cropBottom === "number") crops.set(stem, meta.cropBottom);
            } catch {
              /* ignore a bad sidecar */
            }
          }
        }
        const items = [...videos.entries()]
          .map(([stem, video]) => ({
            id: stem,
            title: stem.replace(/[_-]+/g, " "),
            videoUrl: `/shows/${encodeURIComponent(video.file)}`,
            subtitleUrl: subs.has(stem) ? `/shows/${encodeURIComponent(subs.get(stem)!)}` : null,
            posterUrl: posters.has(stem) ? `/shows/${encodeURIComponent(posters.get(stem)!)}` : null,
            size: video.size,
            cropBottom: crops.get(stem) ?? 0,
          }))
          .sort((a, b) => a.title.localeCompare(b.title, "en", { numeric: true }));
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(JSON.stringify({ videos: items }));
      });
    },
  };
}
