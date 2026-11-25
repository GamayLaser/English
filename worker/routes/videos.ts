import { Hono } from "hono";
import type { Env } from "../env";
import { requireAuth, type AuthVariables } from "../middleware/auth";

export const videoRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const VIDEO_EXT_RE = /\.(mp4|webm|m4v|mov)$/i;
const SUB_EXT_RE = /\.(srt|vtt)$/i;

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-\u4e00-\u9fa5]/g, "_").slice(0, 120);
}

function guessContentType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".vtt")) return "text/vtt; charset=utf-8";
  if (lower.endsWith(".srt")) return "text/plain; charset=utf-8";
  return "video/mp4";
}

function stemOf(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

videoRoutes.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const prefix = `videos/${user.id}/`;
  const listed = await c.env.STORAGE.list({ prefix, limit: 500 });

  const videos = new Map<
    string,
    {
      id: string;
      title: string;
      videoKey: string;
      subtitleKey: string | null;
      size: number;
      uploadedAt: string;
    }
  >();
  const subs = new Map<string, string>();

  for (const obj of listed.objects) {
    const rel = obj.key.slice(prefix.length);
    if (!rel) continue;
    if (VIDEO_EXT_RE.test(rel)) {
      const id = stemOf(rel);
      videos.set(id, {
        id,
        title: id.replace(/[_-]+/g, " "),
        videoKey: rel,
        subtitleKey: null,
        size: obj.size,
        uploadedAt: obj.uploaded.toISOString(),
      });
    } else if (SUB_EXT_RE.test(rel)) {
      subs.set(stemOf(rel), rel);
    }
  }

  for (const [id, item] of videos) {
    item.subtitleKey = subs.get(id) ?? null;
  }

  return c.json({
    videos: [...videos.values()].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
  });
});

videoRoutes.put("/upload", requireAuth, async (c) => {
  const user = c.get("user");
  const rawName = c.req.header("x-file-name") || "";
  const filename = sanitizeName(decodeURIComponent(rawName));
  if (!filename || (!VIDEO_EXT_RE.test(filename) && !SUB_EXT_RE.test(filename))) {
    return c.json({ error: "仅支持 .mp4/.webm/.m4v/.mov 视频或 .srt/.vtt 字幕文件" }, 400);
  }

  if (!c.req.raw.body) {
    return c.json({ error: "上传内容为空" }, 400);
  }

  const key = `videos/${user.id}/${filename}`;
  await c.env.STORAGE.put(key, c.req.raw.body, {
    httpMetadata: { contentType: guessContentType(filename) },
  });

  return c.json({ ok: true, key: filename });
});

videoRoutes.get("/stream/:filename", requireAuth, async (c) => {
  const user = c.get("user");
  const filename = sanitizeName(c.req.param("filename"));
  const key = `videos/${user.id}/${filename}`;

  const head = await c.env.STORAGE.head(key);
  if (!head) return c.json({ error: "Not Found" }, 404);

  const total = head.size;
  const contentType = head.httpMetadata?.contentType || guessContentType(filename);
  const rangeHeader = c.req.header("range");

  if (rangeHeader) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader.trim());
    if (!match) {
      return new Response("Range Not Satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${total}` },
      });
    }
    const start = Number(match[1]);
    const end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
    if (start >= total || start > end) {
      return new Response("Range Not Satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${total}` },
      });
    }
    const length = end - start + 1;
    const obj = await c.env.STORAGE.get(key, { range: { offset: start, length } });
    if (!obj) return c.json({ error: "Not Found" }, 404);

    return new Response(obj.body, {
      status: 206,
      headers: {
        "Content-Type": contentType,
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Content-Length": String(length),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  const obj = await c.env.STORAGE.get(key);
  if (!obj) return c.json({ error: "Not Found" }, 404);

  return new Response(obj.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(total),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    },
  });
});

videoRoutes.get("/subtitle/:filename", requireAuth, async (c) => {
  const user = c.get("user");
  const filename = sanitizeName(c.req.param("filename"));
  const key = `videos/${user.id}/${filename}`;
  const obj = await c.env.STORAGE.get(key);
  if (!obj) return c.json({ error: "Not Found" }, 404);
  const text = await obj.text();
  return c.text(text);
});

videoRoutes.delete("/:filename", requireAuth, async (c) => {
  const user = c.get("user");
  const filename = sanitizeName(c.req.param("filename"));
  const stem = stemOf(filename);
  const prefix = `videos/${user.id}/`;
  const listed = await c.env.STORAGE.list({ prefix, limit: 500 });
  const toDelete = listed.objects
    .map((o) => o.key)
    .filter((k) => stemOf(k.slice(prefix.length)) === stem);
  if (toDelete.length > 0) {
    await c.env.STORAGE.delete(toDelete);
  }
  return c.json({ ok: true, deleted: toDelete.length });
});
