import type { AiSettings } from "../english/types";
import { createAiChatRequestBody } from "../ai/chatRequest";

export type TranslationMode = "auto" | "zh2en" | "en2zh";
type Direction = Exclude<TranslationMode, "auto">;

const endpoint = "/api/ai/chat";

export function resolveDirection(text: string, mode: TranslationMode): Direction {
  if (mode !== "auto") return mode;
  return /[\u3400-\u9fff]/.test(text) ? "zh2en" : "en2zh";
}

export async function quickTranslate({ settings, text, mode, signal }: { settings: AiSettings; text: string; mode: TranslationMode; signal?: AbortSignal }, request = fetch): Promise<string> {
  const source = text.trim();
  if (!source) throw new Error("请输入需要翻译的内容。");
  const direction = resolveDirection(source, mode);
  const response = await request(endpoint, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: createAiChatRequestBody({
      maxTokens: 900,
      messages: [
        { role: "system", content: "You are a fast, precise translator. Return only the natural translation, with no explanation, labels, quotation marks, or markdown. Preserve line breaks, proper nouns, and tone." },
        { role: "user", content: `Translate the following text from ${direction === "zh2en" ? "Chinese to English" : "English to Chinese"}:\n\n${source}` },
      ],
    }),
  });
  if (!response.ok) throw new Error("翻译请求失败，请检查服务器 AI 配置与网络连接后重试。");
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const translation = payload.choices?.[0]?.message?.content?.trim();
  if (!translation) throw new Error("翻译结果为空，请重试。");
  return translation;
}

