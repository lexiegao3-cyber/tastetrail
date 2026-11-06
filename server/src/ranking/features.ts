import type { Book } from "../catalog.js";

/**
 * Sparse TF-IDF style feature vectors over genres, moods and author.
 * IDF down-weights features that almost every book has, so sharing a rare
 * genre ("horror") says more about similarity than sharing "literary".
 */
export type Vector = Map<string, number>;

export function rawFeatures(book: Book): string[] {
  return [
    ...book.genres.map((g) => `genre:${g}`),
    ...book.moods.map((m) => `mood:${m}`),
    `author:${book.author}`,
  ];
}

export function inverseDocumentFrequency(books: readonly Book[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const b of books) {
    for (const f of new Set(rawFeatures(b))) df.set(f, (df.get(f) ?? 0) + 1);
  }
  const n = books.length;
  const idf = new Map<string, number>();
  for (const [f, count] of df) idf.set(f, Math.log((1 + n) / (1 + count)) + 1); // smoothed, always > 0
  return idf;
}

export function vectorize(book: Book, idf: Map<string, number>): Vector {
  const v: Vector = new Map();
  for (const f of rawFeatures(book)) {
    // Author is a strong signal for "more like this" but should not dominate genre.
    const weight = f.startsWith("author:") ? 0.6 : 1;
    v.set(f, (idf.get(f) ?? 1) * weight);
  }
  return v;
}

export function cosine(a: Vector, b: Vector): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, x] of a) {
    na += x * x;
    const y = b.get(k);
    if (y !== undefined) dot += x * y;
  }
  for (const y of b.values()) nb += y * y;
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}
