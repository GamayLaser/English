export type AiChatMessage = { content: string; role: "system" | "user" };

export function createAiChatRequestBody(input: {
  maxTokens: number;
  messages: AiChatMessage[];
  responseFormat?: "json_object" | null;
}): string {
  return JSON.stringify({
    maxTokens: input.maxTokens,
    messages: input.messages,
    responseFormat: input.responseFormat ?? null,
  });
}

