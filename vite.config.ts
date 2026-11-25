import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

function localCardMediaPlugin(): Plugin {
  const webpDir = path.resolve(import.meta.dirname, "../卡片/images/cards-webp");
  return {
    name: "local-card-media",
    configureServer(server) {
      server.middlewares.use("/api/media/cards", (req, res, next) => {
        const raw = (req.url || "").split("?")[0].replace(/^\/+/, "");
        const filename = decodeURIComponent(raw);
        if (!/^[a-zA-Z0-9._-]+\.webp$/.test(filename)) return next();
        const filePath = path.join(webpDir, filename);
        if (!fs.existsSync(filePath)) return next();
        res.setHeader("Content-Type", "image/webp");
        res.setHeader("Cache-Control", "public, max-age=3600");
        fs.createReadStream(filePath).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [
    localCardMediaPlugin(),
    react(),
    tailwindcss(),
    cloudflare(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@shared": path.resolve(import.meta.dirname, "./shared"),
    },
  },
  build: {
    outDir: "dist/client",
  },
});
