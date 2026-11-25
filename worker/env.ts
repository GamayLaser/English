export type Env = {
  ASSETS: Fetcher;
  DB: D1Database;
  STORAGE: R2Bucket;
  SESSION_SECRET: string;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_MODEL?: string;
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_MODEL?: string;
  ELEVENLABS_VOICE_ID?: string;
  PUBLIC_CARDS_CDN_URL?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
};
