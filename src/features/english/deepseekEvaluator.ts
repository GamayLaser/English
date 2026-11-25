import type { AiSettings, ErrorTag, Evaluation, EvaluationIssue, PracticeQuestion } from "./types";
import { createAiChatRequestBody } from "../ai/chatRequest";

export interface EvaluationInput {
  settings: AiSettings;
  question: PracticeQuestion;
  answer: string;
}

const endpoint = "/api/ai/chat";
const allowedTags: ErrorTag[] = ["meaning", "grammar", "word_order", "collocation", "naturalness"];

function prompt(question: PracticeQuestion, answer: string) {
  const source = question.direction === "en2zh" ? question.sentence.en : question.sentence.zh;
  const reference = question.direction === "en2zh" ? question.sentence.zh : question.sentence.en;
  const targetLanguage = question.direction === "en2zh" ? "中文" : "英文";
  return [
    "你是一位严谨、鼓励式的翻译老师。评判语义是否等价，不要要求文字完全相同。",
    "The provided reference translation is a semantic clue, not the only valid translation. Accept wording that is equivalent in meaning, grammatically correct, and natural even when it differs from the reference.",
    `原文：${source}`,
    `参考释义：${reference}`,
    `目标语言：${targetLanguage}`,
    `学生答案：${answer}`,
    "仅返回 JSON：{verdict:'acceptable'|'needs_improvement',score:0-100,acceptedTranslations:string[],feedback:string,issues:[{category:'meaning'|'grammar'|'word_order'|'collocation'|'naturalness',userFragment:string,explanation:string,suggestion:string}],errorTags:string[]}。",
  ].join("\n");
}

function parseIssue(value: unknown): EvaluationIssue | null {
  if (!value || typeof value !== "object") return null;
  const issue = value as Record<string, unknown>;
  if (!allowedTags.includes(issue.category as ErrorTag)) return null;
  if (![issue.userFragment, issue.explanation, issue.suggestion].every(item => typeof item === "string")) return null;
  return { category: issue.category as ErrorTag, userFragment: issue.userFragment as string, explanation: issue.explanation as string, suggestion: issue.suggestion as string };
}

export function parseEvaluation(content: unknown): Evaluation {
  try {
    const value = JSON.parse(typeof content === "string" ? content : "") as Record<string, unknown>;
    const verdict = value.verdict;
    const score = value.score;
    const acceptedTranslations = value.acceptedTranslations;
    const feedback = value.feedback;
    const issues = Array.isArray(value.issues) ? value.issues.map(parseIssue).filter((item): item is EvaluationIssue => item !== null) : null;
    const errorTags = Array.isArray(value.errorTags) ? value.errorTags.filter((item): item is ErrorTag => allowedTags.includes(item as ErrorTag)) : null;
    if ((verdict !== "acceptable" && verdict !== "needs_improvement") || typeof score !== "number" || !Array.isArray(acceptedTranslations) || !acceptedTranslations.every(item => typeof item === "string") || typeof feedback !== "string" || issues === null || errorTags === null) throw new Error();
    return { verdict, score: Math.max(0, Math.min(100, Math.round(score))), acceptedTranslations, feedback, issues, errorTags };
  } catch {
    throw new Error("模型反馈不完整，请重试");
  }
}

export async function evaluateTranslation({ settings, question, answer }: EvaluationInput, request = fetch): Promise<Evaluation> {
  const response = await request(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: createAiChatRequestBody({
      maxTokens: 900,
      responseFormat: "json_object",
      messages: [{ role: "system", content: "只输出符合要求的 JSON。" }, { role: "user", content: prompt(question, answer) }],
    }),
  });
  if (!response.ok) throw new Error("模型请求失败，请检查服务器 AI 配置与网络连接后重试");
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return parseEvaluation(payload.choices?.[0]?.message?.content);
}

