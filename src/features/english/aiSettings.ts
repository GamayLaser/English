import type { AiSettings } from "./types";

/** API credentials live only in the deployment environment. */
export function loadAiSettings(): AiSettings {
  return { apiKey: "", model: "deepseek-v4-flash" };
}

/** Kept as a no-op for backward-compatible feature imports; never writes browser storage. */
export function saveAiSettings(_settings: AiSettings) {}
export function clearAiSettings() {}
