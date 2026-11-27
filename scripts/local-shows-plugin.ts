import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const VIDEO_EXT = new Set([".mp4", ".webm", ".m4v", ".mov"]);
const SUB_EXT = new Set([".srt", ".vtt"]);
const POSTER_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const MIME_BY_EXT: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

/**
 * Lists shows from local-media/shows (videos) + public/shows (subtitles/posters/metadata),
 * and serves local-media/shows videos over /shows/* with HTTP Range support.
 */
export function localShowsPlugin(projectRoot: string): Plugin {
  const publicShowsDir = path.resolve(projectRoot, "public/shows");
  const mediaShowsDir = path.resolve(projectRoot, "local-media/shows");

  return {
    name: "local-shows",
    configureServer(server) {
      // Serve video files from local-media/shows with Range support
      server.middlewares.use("/shows", (req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        const raw = (req.url || "").split("?")[0].replace(/^\/+/, "");
        let filename: string;
        try {
          filename = decodeURIComponent(raw);
        } catch {
          return next();
        }
        if (!filename || filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
          return next();
        }
        const ext = path.extname(filename).toLowerCase();
        if (!VIDEO_EXT.has(ext)) return next();

        const filePath = path.join(mediaShowsDir, filename);
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return next();

        const total = fs.statSync(filePath).size;
        const mime = MIME_BY_EXT[ext] || "application/octet-stream";
        const range = req.headers.range;

        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Content-Type", mime);
        res.setHeader("Cache-Control", "no-store");

        if (range) {
          const match = /^bytes=(\d+)-(\d*)$/.exec(range);
          if (!match) {
            res.statusCode = 416;
            res.setHeader("Content-Range", `bytes */${total}`);
            return res.end();
          }
          const start = Number(match[1]);
          const end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
          if (start >= total || start > end) {
            res.statusCode = 416;
            res.setHeader("Content-Range", `bytes */${total}`);
            return res.end();
          }
          res.statusCode = 206;
          res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
          res.setHeader("Content-Length", String(end - start + 1));
          if (req.method === "HEAD") return res.end();
          fs.createReadStream(filePath, { start, end }).pipe(res);
          return;
        }

        res.statusCode = 200;
        res.setHeader("Content-Length", String(total));
        if (req.method === "HEAD") return res.end();
        fs.createReadStream(filePath).pipe(res);
      });

      server.middlewares.use("/api/shows", (req, res, next) => {
        const pathname = (req.url || "").split("?")[0];
        if (req.method !== "GET" || pathname !== "/") return next();

        fs.mkdirSync(publicShowsDir, { recursive: true });
        fs.mkdirSync(mediaShowsDir, { recursive: true });

        const videos = new Map<string, { file: string; size: number }>();
        const subs = new Map<string, string>();
        const posters = new Map<string, string>();
        const crops = new Map<string, number>();
        const titles = new Map<string, string>();

        const scanDir = (dir: string) => {
          if (!fs.existsSync(dir)) return;
          for (const name of fs.readdirSync(dir)) {
            if (name.startsWith(".") || name.includes("/") || name.includes("\\") || name.includes("..")) continue;
            const ext = path.extname(name).toLowerCase();
            const stem = name.slice(0, -ext.length);
            const fullPath = path.join(dir, name);
            if (!fs.statSync(fullPath).isFile()) continue;
            if (VIDEO_EXT.has(ext)) videos.set(stem, { file: name, size: fs.statSync(fullPath).size });
            else if (SUB_EXT.has(ext)) subs.set(stem, name);
            else if (POSTER_EXT.has(ext)) posters.set(stem, name);
            else if (ext === ".json") {
              try {
                const meta = JSON.parse(fs.readFileSync(fullPath, "utf8").replace(/^\uFEFF/, "")) as {
                  cropBottom?: number;
                  title?: string;
                };
                if (typeof meta.cropBottom === "number") crops.set(stem, meta.cropBottom);
                if (typeof meta.title === "string" && meta.title.trim()) titles.set(stem, meta.title.trim());
              } catch {
                /* ignore a bad sidecar */
              }
            }
          }
        };

        scanDir(publicShowsDir);
        scanDir(mediaShowsDir);

        const items = [...videos.entries()]
          .map(([stem, video]) => ({
            id: stem,
            title: titles.get(stem) ?? stem.replace(/[_-]+/g, " "),
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
