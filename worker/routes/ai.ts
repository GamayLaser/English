import { Hono } from "hono";
import { aiChatInputSchema, audioTtsInputSchema } from "@shared/schemas";
import { createDb } from "../db";
import { aiUsageLogs } from "../db/schema";
import type { Env } from "../env";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { sha256Hex } from "../services/crypto";

export const aiRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

aiRoutes.post("/ai/chat", requireAuth, async (c) => {
  const apiKey = c.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    return c.json({ error: "DEEPSEEK_API_KEY 尚未配置" }, 503);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = aiChatInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "请求参数格式不正确" }, 400);
  }

  const startedAt = Date.now();
  const model = c.env.DEEPSEEK_MODEL?.trim() || "deepseek-chat";
  const upstream = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      thinking: { type: "disabled" },
      response_format: parsed.data.responseFormat ? { type: parsed.data.responseFormat } : undefined,
      max_tokens: parsed.data.maxTokens,
      messages: parsed.data.messages,
    }),
  });

  const db = createDb(c.env.DB);
  const user = c.get("user");

  if (!upstream.ok) {
    c.executionCtx.waitUntil(
      db.insert(aiUsageLogs).values({
        id: crypto.randomUUID(),
        userId: user.id,
        feature: "chat",
        status: "error",
        durationMs: Date.now() - startedAt,
        createdAt: new Date(),
      }),
    );
    return c.json({ error: "模型服务暂时不可用，请稍后重试" }, 502);
  }

  const data = (await upstream.json()) as {
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  c.executionCtx.waitUntil(
    db.insert(aiUsageLogs).values({
      id: crypto.randomUUID(),
      userId: user.id,
      feature: "chat",
      status: "success",
      durationMs: Date.now() - startedAt,
      inputTokens: data.usage?.prompt_tokens ?? null,
      outputTokens: data.usage?.completion_tokens ?? null,
      createdAt: new Date(),
    }),
  );

  return c.json(data);
});

aiRoutes.post("/english/audio", requireAuth, async (c) => {
  const apiKey = c.env.ELEVENLABS_API_KEY?.trim();
  const voiceId = c.env.ELEVENLABS_VOICE_ID?.trim();
  if (!apiKey || !voiceId) {
    return c.json({ error: "ElevenLabs 语音服务尚未配置" }, 503);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = audioTtsInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "没有可朗读的内容" }, 400);
  }

  const modelId = c.env.ELEVENLABS_MODEL?.trim() || "eleven_flash_v2_5";
  const digest = await sha256Hex(`${modelId}\n${voiceId}\n${parsed.data.text}`);
  const r2Key = `audio/${digest.slice(0, 2)}/${digest}.mp3`;

  const cached = await c.env.STORAGE.get(r2Key);
  if (cached) {
    return new Response(cached.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "X-Audio-Source": "r2-cache",
      },
    });
  }

  const generated = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: parsed.data.text, model_id: modelId }),
    },
  );

  if (!generated.ok || !generated.body) {
    return c.json({ error: "朗读服务暂时不可用，请稍后重试" }, 502);
  }

  const [clientStream, cacheStream] = generated.body.tee();
  c.executionCtx.waitUntil(
    new Response(cacheStream)
      .arrayBuffer()
      .then((buf) => {
        if (buf.byteLength > 0) {
          return c.env.STORAGE.put(r2Key, buf, {
            httpMetadata: { contentType: "audio/mpeg" },
          });
        }
        return undefined;
      })
      .catch((err) => console.error("R2 audio cache write failed:", err)),
  );

  return new Response(clientStream, {
    headers: {
      "Content-Type": "audio/mpeg",
      "X-Audio-Source": "elevenlabs",
    },
  });
});
