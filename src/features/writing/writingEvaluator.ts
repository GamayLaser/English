import type { AiSettings, WritingTopic } from "../english/types";
import type { WritingEvaluation } from "./writingTypes";
import { createAiChatRequestBody } from "../ai/chatRequest";

const endpoint = "/api/ai/chat";

function clamp(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : null;
}

function prompt(topic: WritingTopic, draft: string) {
  return [
    "你是一位成人英语写作教练。请重点识别并修正中式英语，保留作者原意并给出更地道的母语者表达。",
    `题目：${topic.title}`,
    `任务：${topic.prompt}`,
    `词数要求：至少 ${topic.minWords} 词，建议 ${topic.recommendedWords} 词。`,
    `必须覆盖：${topic.requiredPoints.join("；")}`,
    `提示词：${topic.vocabularyHints.join("、")}`,
    `学生作文：${draft}`,
    "仅返回 JSON：{totalScore:0-100,scores:{content:0-25,grammar:0-25,vocabulary:0-25,structure:0-25},feedback:string,strengths:string[],improvements:string[],revisedWriting:string}。feedback 用简明中文说明得分原因；strengths 和 improvements 各给 0-3 条具体建议；revisedWriting 为保留学生原意的英文润色参考稿。",
  ].join("\n");
}

export function parseWritingEvaluation(content: unknown): WritingEvaluation {
  try {
    const value = JSON.parse(typeof content === "string" ? content : "") as Record<string, unknown>;
    const scores = value.scores as Record<string, unknown> | undefined;
    const totalScore = clamp(value.totalScore, 0, 100);
    const parsedScores = scores ? {
      content: clamp(scores.content, 0, 25),
      grammar: clamp(scores.grammar, 0, 25),
      vocabulary: clamp(scores.vocabulary, 0, 25),
      structure: clamp(scores.structure, 0, 25),
    } : null;
    if (totalScore === null || !parsedScores || Object.values(parsedScores).some((score) => score === null) || typeof value.feedback !== "string" || !Array.isArray(value.strengths) || !value.strengths.every((item) => typeof item === "string") || !Array.isArray(value.improvements) || !value.improvements.every((item) => typeof item === "string") || typeof value.revisedWriting !== "string") throw new Error();
    return { totalScore, scores: parsedScores as WritingEvaluation["scores"], feedback: value.feedback, strengths: value.strengths, improvements: value.improvements, revisedWriting: value.revisedWriting };
  } catch {
    throw new Error("模型反馈不完整，请重试");
  }
}

export async function evaluateWriting({ settings, topic, draft }: { settings: AiSettings; topic: WritingTopic; draft: string }, request: typeof fetch = fetch): Promise<WritingEvaluation> {
  if (!draft.trim()) throw new Error("请先完成作文后再提交评分。");
  const response = await request(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: createAiChatRequestBody({
      maxTokens: 900,
      responseFormat: "json_object",
      messages: [{ role: "system", content: "只输出符合要求的 JSON。" }, { role: "user", content: prompt(topic, draft.trim()) }],
    }),
  });
  if (!response.ok) throw new Error("模型请求失败，请检查服务器 AI 配置与网络连接后重试");
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return parseWritingEvaluation(payload.choices?.[0]?.message?.content);
}

