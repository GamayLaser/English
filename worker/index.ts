import { Hono } from "hono";
import type { Env } from "./env";
import { aiRoutes } from "./routes/ai";
import { authRoutes } from "./routes/auth";
import { recordRoutes } from "./routes/records";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) =>
  c.json({
    status: "ok",
    runtime: "cloudflare-workers",
    cardsCdnUrl: c.env.PUBLIC_CARDS_CDN_URL || "",
  }),
);

app.get("/api/media/cards/:filename", async (c) => {
  const filename = c.req.param("filename");
  if (!/^[a-zA-Z0-9._-]+\.webp$/.test(filename)) {
    return c.json({ error: "Invalid filename" }, 400);
  }
  const object = await c.env.STORAGE.get(`cards/${filename}`);
  if (!object) return c.json({ error: "Not Found" }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});

app.route("/api/auth", authRoutes);
app.route("/api", aiRoutes);
app.route("/api/private-records", recordRoutes);

app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
