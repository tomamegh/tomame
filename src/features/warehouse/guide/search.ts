/**
 * FAQ and glossary search (081 guide): every word typed must appear somewhere
 * in the entry, in any order, ignoring case and punctuation — so "label blurry"
 * finds "Why is my label fuzzy or blurry?".
 */

export interface Searchable {
  id: string;
  q: string;
  a: string;
  tags?: readonly string[];
}

export function normaliseSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

export function searchEntries<T extends Searchable>(entries: readonly T[], query: string): T[] {
  const words = normaliseSearch(query).split(" ").filter(Boolean);
  if (words.length === 0) return [...entries];
  const scored: Array<{ entry: T; score: number; index: number }> = [];
  entries.forEach((entry, index) => {
    const question = normaliseSearch(entry.q);
    const haystack = `${question} ${normaliseSearch(entry.a)} ${normaliseSearch((entry.tags ?? []).join(" "))}`;
    if (!words.every((w) => haystack.includes(w))) return;
    // Hits in the question outrank hits in the answer.
    const score = words.reduce((s, w) => s + (question.includes(w) ? 2 : 1), 0);
    scored.push({ entry, score, index });
  });
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map((s) => s.entry);
}
