import type { VocabEntry } from "@shared/schemas";
import { getEntryMode, loadAllVocabEntries, loadVocabIndex } from "./vocabStore";

export interface VocabMatcher {
  regex: RegExp | null;
  lookup: Map<string, VocabEntry>;
}

export interface VocabToken {
  text: string;
  entry?: VocabEntry;
}

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "so", "as", "at", "by", "for",
  "from", "in", "into", "of", "on", "to", "with", "is", "am", "are", "was",
  "were", "be", "been", "being", "have", "has", "had", "do", "does", "did",
  "will", "would", "can", "could", "may", "might", "must", "shall", "should",
  "i", "me", "my", "you", "your", "he", "him", "his", "she", "her", "it",
  "its", "we", "us", "our", "they", "them", "their", "this", "that", "these",
  "those", "not", "no", "yes", "all", "one", "two",
]);

let cachedMatcherPromise: Promise<VocabMatcher> | null = null;

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeTerm(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

function registerInflections(base: string, entry: VocabEntry, lookup: Map<string, VocabEntry>) {
  if (base.includes(" ") || base.length < 4 || !/^[a-z]+$/.test(base)) return;
  const candidates = [
    `${base}s`,
    `${base}es`,
    `${base}ed`,
    `${base}ing`,
    base.endsWith("e") ? `${base}d` : "",
    base.endsWith("e") && base.length > 4 ? `${base.slice(0, -1)}ing` : "",
    base.endsWith("y") && !/[aeiou]y$/.test(base) ? `${base.slice(0, -1)}ies` : "",
    base.endsWith("y") && !/[aeiou]y$/.test(base) ? `${base.slice(0, -1)}ied` : "",
  ];
  for (const variant of candidates) {
    if (variant && !lookup.has(variant) && !STOP_WORDS.has(variant)) {
      lookup.set(variant, entry);
    }
  }
}

export function loadVocabMatcher(): Promise<VocabMatcher> {
  if (cachedMatcherPromise) return cachedMatcherPromise;
  cachedMatcherPromise = (async () => {
    const categories = await loadVocabIndex();
    const entries = await loadAllVocabEntries(categories);
    const lookup = new Map<string, VocabEntry>();

    for (const entry of entries) {
      if (getEntryMode(entry) === "sentence") continue;
      const term = normalizeTerm(entry.word || "");
      if (!term || term.length < 3) continue;
      if (!term.includes(" ") && STOP_WORDS.has(term)) continue;
      if (!lookup.has(term)) {
        lookup.set(term, entry);
      }
    }

    // Register simple inflections for single words without overriding base cards
    const baseEntries = [...lookup.entries()];
    for (const [term, entry] of baseEntries) {
      registerInflections(term, entry, lookup);
    }

    const terms = [...lookup.keys()].sort((a, b) => b.length - a.length);
    if (terms.length === 0) {
      return { regex: null, lookup };
    }

    const pattern = terms
      .map((t) => (t.includes(" ") ? escapeRegExp(t).replace(/\\ /g, "\\s+") : escapeRegExp(t)))
      .join("|");
    const regex = new RegExp(`\\b(${pattern})\\b`, "gi");
    return { regex, lookup };
  })().catch(() => ({ regex: null, lookup: new Map() }));

  return cachedMatcherPromise;
}

export function tokenizeVocabMatches(text: string, matcher: VocabMatcher | null): VocabToken[] {
  if (!text || !matcher?.regex) return [{ text }];

  const tokens: VocabToken[] = [];
  const regex = new RegExp(matcher.regex.source, matcher.regex.flags);
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const matchedText = match[0];
    const start = match.index;
    if (start > lastIndex) {
      tokens.push({ text: text.slice(lastIndex, start) });
    }
    const key = normalizeTerm(matchedText);
    const entry = matcher.lookup.get(key);
    tokens.push(entry ? { text: matchedText, entry } : { text: matchedText });
    lastIndex = start + matchedText.length;
  }

  if (lastIndex < text.length) {
    tokens.push({ text: text.slice(lastIndex) });
  }
  return tokens.length > 0 ? tokens : [{ text }];
}
