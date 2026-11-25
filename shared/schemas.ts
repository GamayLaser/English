import { z } from "zod";

export const loginInputSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(8).max(256),
});

export const registerInputSchema = loginInputSchema;

export const privateRecordUpsertSchema = z.object({
  value: z.unknown(),
  version: z.number().int().min(0).max(2_147_483_646),
});

export const aiChatInputSchema = z.object({
  maxTokens: z.number().int().min(1).max(2_000).default(900),
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user"]),
        content: z.string().min(1).max(80_000),
      }),
    )
    .min(1)
    .max(8),
  responseFormat: z.enum(["json_object"]).nullable().optional().default(null),
});

export const audioTtsInputSchema = z.object({
  text: z.string().trim().min(1).max(10_000),
});

export type UserProfile = {
  id: string;
  username: string;
  role: "admin" | "member";
  allowedMenus: string[];
};

export type VocabCategoryMeta = {
  id: string;
  nameEn: string;
  icon: string;
  description: string;
  group: string;
  count: number;
};

export type VocabEntry = {
  id: string;
  category: string;
  entryType?: "word" | "sentence";
  cardMode?: "word" | "phrase" | "sentence";
  word: string;
  pos?: string;
  definition: string;
  sentence?: string;
  topic?: string;
  context?: string[];
  imageId?: string;
  imageStatus?: string;
  audioText?: string;
  exampleAudio?: string;
  pattern?: string;
  usage?: string;
};
