import type { AiSettings, ReadingArticle } from "../english/types";
import { createAiChatRequestBody } from "../ai/chatRequest";

export interface ReadingQuizQuestion {
  id: string;
  type: "choice" | "short";
  question: string;
  options: string[];
  answer: string;
  explanation: string;
}

export interface ReadingQuiz {
  questions: ReadingQuizQuestion[];
}

export interface ReadingQuizResult {
  score: number;
  feedback: string;
  answers: Array<{ id: string; correct: boolean; explanation: string }>;
}

const endpoint = "/api/ai/chat";

function parseQuiz(content: unknown): ReadingQuiz {
  try {
    const value = JSON.parse(typeof content === "string" ? content : "") as { questions?: unknown };
    if (!Array.isArray(value.questions) || value.questions.length < 3) throw new Error();
    const questions = value.questions.map((item, index) => {
      const question = item as Record<string, unknown>;
      if ((question.type !== "choice" && question.type !== "short") || typeof question.question !== "string" || !Array.isArray(question.options) || !question.options.every((option) => typeof option === "string") || typeof question.answer !== "string" || typeof question.explanation !== "string") throw new Error();
      return { id: `quiz-${index + 1}`, type: question.type as ReadingQuizQuestion["type"], question: question.question, options: question.options as string[], answer: question.answer, explanation: question.explanation };
    });
    return { questions };
  } catch { throw new Error("题目生成不完整，请重试。"); }
}

function parseResult(content: unknown, quiz: ReadingQuiz): ReadingQuizResult {
  try {
    const value = JSON.parse(typeof content === "string" ? content : "") as Record<string, unknown>;
    if (typeof value.score !== "number" || typeof value.feedback !== "string" || !Array.isArray(value.answers)) throw new Error();
    const answers = quiz.questions.map((question) => {
      const found = (value.answers as unknown[]).find((item) => (item as Record<string, unknown>)?.id === question.id) as Record<string, unknown> | undefined;
      if (!found || typeof found.correct !== "boolean" || typeof found.explanation !== "string") throw new Error();
      return { id: question.id, correct: found.correct, explanation: found.explanation };
    });
    return { score: Math.max(0, Math.min(100, Math.round(value.score))), feedback: value.feedback, answers };
  } catch { throw new Error("判卷反馈不完整，请重试。"); }
}

async function requestJson(settings: AiSettings, content: string, request = fetch) {
  const response = await request(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: createAiChatRequestBody({ maxTokens: 1400, responseFormat: "json_object", messages: [{ role: "system", content: "只输出符合要求的 JSON。" }, { role: "user", content }] }) });
  if (!response.ok) throw new Error("模型请求失败，请检查服务器 AI 配置与网络连接后重试。");
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return payload.choices?.[0]?.message?.content;
}

export async function createReadingQuiz({ settings, article }: { settings: AiSettings; article: ReadingArticle }) {
  const content = await requestJson(settings, [
    "你是一位小学英语阅读老师。基于下方文章生成 5 道阅读理解题：3 道四选一选择题和 2 道简短问答题。",
    "所有题干必须用小学常用英语词，只用 What、Who、Where、When、Why、How 等简单问法；选择项也必须短、简单、可从原文判断。",
    `文章标题：${article.title}\n文章：${article.content}`,
    "仅返回 JSON：{questions:[{type:'choice'|'short',question:string,options:string[],answer:string,explanation:string}]}。choice 必须有 4 个 options，short 的 options 为 []。",
  ].join("\n"));
  return parseQuiz(content);
}

export async function evaluateReadingQuiz({ settings, quiz, answers }: { settings: AiSettings; quiz: ReadingQuiz; answers: Record<string, string> }) {
  const content = await requestJson(settings, [
    "你是一位鼓励式小学英语阅读老师。请按题目标准答案判卷，简短解释每题答案依据；对接近正确的简答题给部分肯定。",
    `题目：${JSON.stringify(quiz.questions)}`,
    `学生答案：${JSON.stringify(answers)}`,
    "仅返回 JSON：{score:number,feedback:string,answers:[{id:string,correct:boolean,explanation:string}]}。",
  ].join("\n"));
  return parseResult(content, quiz);
}

