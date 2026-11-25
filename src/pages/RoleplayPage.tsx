import { useEffect, useRef, useState } from "react";
import { EnglishButton, EnglishPageHeader } from "../components/english/EnglishUi";
import { Button, Card } from "../components/ui";
import { uiFieldClassName, uiFieldStyle } from "../components/ui/styles";
import { createAiChatRequestBody } from "../features/ai/chatRequest";
import { speakVocabText } from "../features/vocab/vocabStore";
import type { ThemeColors } from "../types";

type Scenario = {
  id: string;
  title: string;
  subtitle: string;
  aiRole: string;
  openingEn: string;
  openingZh: string;
  starterHints: Array<{ en: string; zh: string }>;
};

const SCENARIOS: Scenario[] = [
  {
    id: "coffee",
    title: "咖啡店点单",
    subtitle: "点一杯冰美式或拿铁，练习常见店员提问",
    aiRole: "Friendly barista at a US coffee shop",
    openingEn: "Hi there! Welcome in. What can I get started for you today?",
    openingZh: "你好！欢迎光临。今天想喝点什么？",
    starterHints: [
      { en: "Hi, can I get an iced latte, please?", zh: "你好，请给我一杯冰拿铁。" },
      { en: "Just a medium black coffee, thanks.", zh: "只要一杯中杯黑咖啡，谢谢。" },
      { en: "What do you recommend?", zh: "你们有什么推荐的吗？" },
    ],
  },
  {
    id: "airport",
    title: "机场入境 & 值机",
    subtitle: "应对海关常见提问与行李托运",
    aiRole: "Polite US airport customs officer",
    openingEn: "Hello! Passport, please. What is the purpose of your visit?",
    openingZh: "你好！请出示护照。你这次来访的目的是什么？",
    starterHints: [
      { en: "I'm here on vacation for two weeks.", zh: "我来这里度假两周。" },
      { en: "I'm visiting some friends.", zh: "我来看望几个朋友。" },
      { en: "I'm here for a business trip.", zh: "我是来出差的。" },
    ],
  },
  {
    id: "restaurant",
    title: "餐厅点餐与买单",
    subtitle: "询问忌口、点菜、要水与结账",
    aiRole: "Warm server at an American diner",
    openingEn: "Hey, welcome! Are you ready to order, or do you need a few more minutes?",
    openingZh: "嗨，欢迎！准备好点餐了吗，还是需要再看几分钟？",
    starterHints: [
      { en: "I'm ready. Could I have the cheeseburger?", zh: "准备好了，我要一份芝士汉堡。" },
      { en: "Could I get a couple more minutes, please?", zh: "麻烦再给我几分钟好吗？" },
      { en: "Can we get some water first?", zh: "能先给我们来点水吗？" },
    ],
  },
  {
    id: "directions",
    title: "打车 & 问路",
    subtitle: "确认目的地、下车点与附近地铁站",
    aiRole: "Friendly Uber driver in New York",
    openingEn: "Hey! Heading to downtown Manhattan, right? How's your day going so far?",
    openingZh: "嗨！是去曼哈顿下城对吧？今天过得怎么样？",
    starterHints: [
      { en: "Yes, please! Pretty good, thanks.", zh: "是的！挺不错的，谢谢。" },
      { en: "Yes, you can drop me off near the corner.", zh: "对，你可以在路口附近放我下车。" },
      { en: "How long will it take to get there?", zh: "到那里大概需要多久？" },
    ],
  },
  {
    id: "smalltalk",
    title: "老外日常闲聊",
    subtitle: "练习美剧里最常见的寒暄与接话方式",
    aiRole: "Friendly American neighbor or coworker",
    openingEn: "Hey! Long time no see. How have you been lately?",
    openingZh: "嗨！好久不见，最近怎么样？",
    starterHints: [
      { en: "Not bad! Just keeping busy with work.", zh: "还不错！最近一直在忙工作。" },
      { en: "Pretty good! How about you?", zh: "挺好的！你呢？" },
      { en: "Can't complain! Nice weather today, isn't it?", zh: "挺好的！今天天气不错对吧？" },
    ],
  },
  {
    id: "tvshows",
    title: "聊美剧 & 周末计划",
    subtitle: "用简单英语聊喜欢的剧集和周末安排",
    aiRole: "American friend chatting over lunch",
    openingEn: "So, any fun plans for the weekend? Watching anything good lately?",
    openingZh: "周末有什么好玩的计划吗？最近在看什么好看的剧吗？",
    starterHints: [
      { en: "I've been watching Friends to practice English.", zh: "我最近在看《老友记》练英语。" },
      { en: "Nothing big, just gonna relax at home.", zh: "没什么大事，就打算在家休息。" },
      { en: "Do you have any good show recommendations?", zh: "你有什么好看的剧推荐吗？" },
    ],
  },
];

type ChatTurn = {
  id: string;
  role: "ai" | "user";
  en: string;
  zh?: string;
  betterWay?: string;
};

type RoleplayReply = {
  replyEn: string;
  replyZh: string;
  betterWay?: string;
  suggestions: Array<{ en: string; zh: string }>;
};

function SpeakerSvg() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

function MicSvg() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition || w.webkitSpeechRecognition || null) as (new () => SpeechRecognitionInstance) | null;
}

export default function RoleplayPage({ c }: { c: ThemeColors }) {
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0];

  const [messages, setMessages] = useState<ChatTurn[]>([
    { id: "init", role: "ai", en: scenario.openingEn, zh: scenario.openingZh },
  ]);
  const [hints, setHints] = useState<Array<{ en: string; zh: string }>>(scenario.starterHints);
  const [showHints, setShowHints] = useState(true);
  const [showZh, setShowZh] = useState(true);
  const [speed, setSpeed] = useState(0.9);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listeningMic, setListeningMic] = useState(false);
  const [error, setError] = useState("");

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const supportsMic = Boolean(getSpeechRecognitionCtor());

  function resetScenario(nextId: string) {
    const next = SCENARIOS.find((s) => s.id === nextId) ?? SCENARIOS[0];
    setScenarioId(next.id);
    setMessages([{ id: `init-${next.id}`, role: "ai", en: next.openingEn, zh: next.openingZh }]);
    setHints(next.starterHints);
    setInput("");
    setError("");
    speakVocabText(next.openingEn, speed);
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  function toggleMic() {
    if (listeningMic) {
      recognitionRef.current?.stop();
      setListeningMic(false);
      return;
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
      const text = event.results?.[0]?.[0]?.transcript?.trim();
      if (text) setInput((prev) => (prev ? `${prev} ${text}` : text));
    };
    rec.onerror = () => setListeningMic(false);
    rec.onend = () => setListeningMic(false);
    recognitionRef.current = rec;
    setListeningMic(true);
    rec.start();
  }

  async function sendMessage(textToSend?: string) {
    const userText = (textToSend ?? input).trim();
    if (!userText || busy) return;

    const userTurn: ChatTurn = { id: `u-${Date.now()}`, role: "user", en: userText };
    const historyForPrompt = [...messages, userTurn];
    setMessages(historyForPrompt);
    setInput("");
    setError("");
    setBusy(true);

    try {
      const systemPrompt = [
        `You are playing the role of: ${scenario.aiRole}.`,
        "The user is an adult Chinese beginner learning practical spoken English (aiming to understand US TV shows and talk naturally).",
        "Keep your reply short (1-2 natural, everyday spoken sentences), warm, and easy to understand.",
        "Return ONLY valid JSON with this exact shape:",
        "{",
        '  "replyEn": "your natural English reply",',
        '  "replyZh": "accurate natural Chinese translation of replyEn",',
        '  "betterWay": "optional short tip in Chinese + a more natural US spoken phrasing if the user\'s English had grammar errors or sounded unnatural; empty string if user\'s message was already natural",',
        '  "suggestions": [{"en": "natural reply option 1", "zh": "中文意思"}, {"en": "option 2", "zh": "中文意思"}, {"en": "option 3", "zh": "中文意思"}]',
        "}",
      ].join("\n");

      const chatMessages = [
        { role: "system" as const, content: systemPrompt },
        ...historyForPrompt.slice(-8).map((m) => ({
          role: m.role === "ai" ? ("assistant" as const) : ("user" as const),
          content: m.en,
        })),
      ];

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: createAiChatRequestBody({
          maxTokens: 500,
          messages: chatMessages as unknown as Array<{ role: "system" | "user"; content: string }>,
          responseFormat: "json_object",
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error || "对话服务暂时不可用，请确认后端已登录并配置 DEEPSEEK_API_KEY。");
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const raw = data.choices?.[0]?.message?.content ?? "";
      const parsed = JSON.parse(raw) as RoleplayReply;

      const aiTurn: ChatTurn = {
        id: `a-${Date.now()}`,
        role: "ai",
        en: parsed.replyEn || "Got it! Tell me more.",
        zh: parsed.replyZh || "",
      };

      setMessages((prev) =>
        prev.map((m) =>
          m.id === userTurn.id && parsed.betterWay ? { ...m, betterWay: parsed.betterWay } : m,
        ).concat(aiTurn),
      );
      if (Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0) {
        setHints(parsed.suggestions.slice(0, 3));
      }
      speakVocabText(aiTurn.en, speed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 pb-8 zen-page-enter">
      <EnglishPageHeader
        c={c}
        eyebrow="AI ROLEPLAY"
        title="AI 情景对话"
        description={scenario.subtitle}
        aside={
          <>
            <select
              value={scenario.id}
              onChange={(e) => resetScenario(e.target.value)}
              className="min-h-9 rounded-xl border px-3 py-1.5 text-[13px] font-medium outline-none"
              style={{ background: c.inputBg, borderColor: c.inputBorder, color: c.fg }}
              aria-label="选择对话场景"
            >
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <Button
              c={c}
              variant="secondary"
              onClick={() => setSpeed((s) => (s === 0.9 ? 1.0 : s === 1.0 ? 0.75 : 0.9))}
            >
              语速 {speed}x
            </Button>
            <Button c={c} variant="secondary" onClick={() => setShowZh((v) => !v)}>
              {showZh ? "隐藏中文" : "显示中文"}
            </Button>
          </>
        }
      />

      <Card c={c}>
        <div className="flex flex-col h-[min(64vh,560px)]">
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 md:p-6 space-y-4">
            {messages.map((msg) => {
              const isAi = msg.role === "ai";
              return (
                <div key={msg.id} className={`flex flex-col ${isAi ? "items-start" : "items-end"}`}>
                  <div
                    className="max-w-[85%] md:max-w-[72%] rounded-2xl px-4 py-3 space-y-1.5"
                    style={
                      isAi
                        ? { background: c.inputBg, border: `1px solid ${c.borderSub}`, color: c.fg }
                        : { background: c.accent, color: c.accentFg }
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[15px] leading-relaxed font-medium" lang="en">
                        {msg.en}
                      </p>
                      {isAi && (
                        <button
                          type="button"
                          onClick={() => speakVocabText(msg.en, speed)}
                          className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full cursor-pointer transition-transform hover:scale-105"
                          style={{ background: c.accentDim, color: c.accent }}
                          title="重听这一句"
                          aria-label="朗读"
                        >
                          <SpeakerSvg />
                        </button>
                      )}
                    </div>
                    {isAi && showZh && msg.zh && (
                      <p className="text-xs leading-relaxed" style={{ color: c.fgMuted }}>
                        {msg.zh}
                      </p>
                    )}
                  </div>
                  {!isAi && msg.betterWay && (
                    <p
                      className="mt-1.5 max-w-[85%] md:max-w-[72%] rounded-xl px-3 py-2 text-xs leading-relaxed"
                      style={{ background: c.accentDim, color: c.accent }}
                    >
                      地道说法：{msg.betterWay}
                    </p>
                  )}
                </div>
              );
            })}

            {busy && (
              <div className="flex items-start">
                <div
                  className="rounded-2xl px-4 py-3 text-sm"
                  style={{ background: c.inputBg, color: c.fgMuted }}
                >
                  对方正在输入…
                </div>
              </div>
            )}
          </div>

          {/* Beginner Hints Bar */}
          <div className="border-t px-5 py-3 space-y-2.5" style={{ borderColor: c.borderSub }}>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowHints((v) => !v)}
                className="text-xs font-semibold cursor-pointer"
                style={{ color: c.accent }}
              >
                {showHints ? "▾ 隐藏零基础提示卡" : "▸ 不知道怎么回？点击看提示"}
              </button>
              <button
                type="button"
                onClick={() => resetScenario(scenario.id)}
                className="text-xs cursor-pointer"
                style={{ color: c.fgMuted }}
              >
                重新开始本场景
              </button>
            </div>

            {showHints && hints.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-3">
                {hints.map((hint) => (
                  <button
                    key={hint.en}
                    type="button"
                    disabled={busy}
                    onClick={() => void sendMessage(hint.en)}
                    className="rounded-xl p-2.5 text-left transition-colors cursor-pointer disabled:opacity-50"
                    style={{ background: c.inputBg, border: `1px solid ${c.borderSub}` }}
                  >
                    <p className="text-xs font-semibold leading-snug" style={{ color: c.fg }} lang="en">
                      {hint.en}
                    </p>
                    <p className="mt-1 text-[11px]" style={{ color: c.fgMuted }}>
                      {hint.zh}
                    </p>
                  </button>
                ))}
              </div>
            )}

            {error && (
              <p className="text-xs" style={{ color: c.danger }}>
                {error}
              </p>
            )}

            {/* Input Row */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendMessage();
              }}
              className="flex items-center gap-2 pt-1"
            >
              {supportsMic && (
                <EnglishButton
                  type="button"
                  variant={listeningMic ? "danger" : "secondary"}
                  c={c}
                  onClick={toggleMic}
                  title={listeningMic ? "停止语音识别" : "按住或点击说英文"}
                >
                  <MicSvg />
                  <span className="hidden sm:inline">{listeningMic ? "聆听中…" : "语音"}</span>
                </EnglishButton>
              )}
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="用英语回复，或直接点击上方提示句发送…"
                className={uiFieldClassName()}
                style={uiFieldStyle(c)}
              />
              <Button type="submit" variant="primary" c={c} disabled={busy || !input.trim()}>
                发送
              </Button>
            </form>
          </div>
        </div>
      </Card>
    </div>
  );
}
