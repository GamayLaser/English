import type { AiSettings, ReadingArticle } from "../english/types";
import { createAiChatRequestBody } from "../ai/chatRequest";

const endpoint = "/api/ai/chat";

export interface ReadingSummaryEvaluation {
  score: number;
  feedback: string;
  strengths: string[];
  improvements: string[];
  modelSummary?: string;
}

export interface ReadingSummaryEvaluationInput {
  settings: AiSettings;
  article: ReadingArticle;
  summary: string;
}

function prompt(article: ReadingArticle, summary: string) {
  return [
    "你是一位鼓励式成人英语阅读教练。根据原文判断学习者是否理解文章大意，不要求逐字复述，重点关注表达清晰度与地道性。",
    `文章标题：${article.title}`,
    `原文：${article.content}`,
    `学生概述：${summary}`,
    "请从人物、事件、时间地点、结果和关键细节等角度综合评分；不能因为表达方式不同扣分。",
    "仅返回 JSON：{score:0-100,feedback:string,strengths:string[],improvements:string[],modelSummary:string}。feedback 用简明中文解释得分原因；strengths 和 improvements 各给 0-3 条具体建议；modelSummary 为 2-3 句地道母语者英文复述示范。",
  ].join("\n");
}

export function parseReadingSummaryEvaluation(content: unknown): ReadingSummaryEvaluation {
  try {
    const value = JSON.parse(typeof content === "string" ? content : "") as Record<string, unknown>;
    const { score, feedback, strengths, improvements, modelSummary } = value;
    if (typeof score !== "number" || typeof feedback !== "string" || !Array.isArray(strengths) || !strengths.every((item) => typeof item === "string") || !Array.isArray(improvements) || !improvements.every((item) => typeof item === "string")) throw new Error();
    return { score: Math.max(0, Math.min(100, Math.round(score))), feedback, strengths, improvements, modelSummary: typeof modelSummary === "string" ? modelSummary : undefined };
  } catch {
    throw new Error("模型反馈不完整，请重试");
  }
}

export async function evaluateReadingSummary({ settings, article, summary }: ReadingSummaryEvaluationInput, request = fetch): Promise<ReadingSummaryEvaluation> {
  if (!summary.trim()) throw new Error("请先填写文章大意后再提交评分。");
  const response = await request(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: createAiChatRequestBody({
      maxTokens: 700,
      responseFormat: "json_object",
      messages: [{ role: "system", content: "只输出符合要求的 JSON。" }, { role: "user", content: prompt(article, summary) }],
    }),
  });
  if (!response.ok) throw new Error("模型请求失败，请检查服务器 AI 配置与网络连接后重试");
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return parseReadingSummaryEvaluation(payload.choices?.[0]?.message?.content);
}

