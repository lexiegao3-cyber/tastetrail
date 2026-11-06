import type { Book } from "../catalog.js";
import { cosine, inverseDocumentFrequency, vectorize, type Vector } from "./features.js";

/**
 * Explainable content-based recommender.
 *
 * 1. Score every eligible book on independent components (genre match,
 *    reading-time fit, mood match, similarity to the user's shelf, and a
 *    weak popularity prior). Components the user expressed no preference
 *    for are left out and the remaining weights are renormalised, so a user
 *    who only picked genres is not penalised for an unset time budget.
 * 2. Re-rank with Maximal Marginal Relevance so the list is not five books
 *    by the same author: each pick trades relevance against similarity to
 *    what has already been picked.
 * 3. Attach human-readable reasons derived from each component's actual
 *    contribution to the final score.
 *
 * The function is pure and deterministic: identical input always yields an
 * identical list (scores are rounded before comparison and ties fall back to
 * book id), which keeps recommendations stable and testable.
 */

export const DEFAULT_WPM = 250;
export const WORDS_PER_PAGE = 275;
export const MAX_BUDGET_OVERRUN = 2; // books over 2x the budget are not shown

export const WEIGHTS = { genre: 0.45, time: 0.2, mood: 0.15, shelf: 0.15, popularity: 0.05 } as const;
type Component = keyof typeof WEIGHTS;

export interface RankRequest {
  genres?: string[];
  moods?: string[];
  budgetMinutes?: number;
  wordsPerMinute?: number;
  /** Saved book ids: excluded from results and used as positive feedback. */
  shelf?: string[];
  /** Books the user marked "not interested": excluded. */
  dismissed?: string[];
  limit?: number;
  /** MMR trade-off in [0, 1]. 1 = pure relevance, lower = more diverse. */
  lambda?: number;
}

export interface Reason {
  component: Component;
  text: string;
  contribution: number;
}

export interface Recommendation {
  book: Book;
  score: number;
  readingMinutes: number;
  components: Partial<Record<Component, number>>;
  reasons: Reason[];
}

const round = (x: number) => Math.round(x * 1e9) / 1e9;

export function readingMinutes(book: Book, wpm = DEFAULT_WPM): number {
  return Math.round((book.pages * WORDS_PER_PAGE) / wpm);
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = min / 60;
  return h < 10 ? `${h.toFixed(1).replace(/\.0$/, "")} h` : `${Math.round(h)} h`;
}

/** 1.0 when the book fits the budget well, decaying smoothly when it runs over. */
export function timeFit(minutes: number, budget: number): number {
  const r = minutes / budget;
  if (r <= 1) return 1 - 0.3 * (1 - r) ** 2; // short books are fine, slightly less "filling"
  return Math.exp(-(((r - 1) / 0.35) ** 2));
}

function genreScore(book: Book, preferred: Set<string>, idf: Map<string, number>): number {
  let hit = 0;
  let total = 0;
  for (const g of book.genres) {
    const w = idf.get(`genre:${g}`) ?? 1;
    total += w;
    if (preferred.has(g)) hit += w;
  }
  return total === 0 ? 0 : hit / total;
}

export class Recommender {
  private readonly idf: Map<string, number>;
  private readonly vectors: Map<string, Vector>;

  constructor(private readonly catalog: readonly Book[]) {
    this.idf = inverseDocumentFrequency(catalog);
    this.vectors = new Map(catalog.map((b) => [b.id, vectorize(b, this.idf)]));
  }

  similarity(a: string, b: string): number {
    const va = this.vectors.get(a);
    const vb = this.vectors.get(b);
    return va && vb ? cosine(va, vb) : 0;
  }

  recommend(req: RankRequest): Recommendation[] {
    const genres = new Set(req.genres ?? []);
    const moods = new Set(req.moods ?? []);
    const wpm = req.wordsPerMinute ?? DEFAULT_WPM;
    const shelf = (req.shelf ?? []).filter((id) => this.vectors.has(id));
    const excluded = new Set([...shelf, ...(req.dismissed ?? [])]);
    const limit = Math.max(1, Math.min(req.limit ?? 6, 50));
    const lambda = Math.min(1, Math.max(0, req.lambda ?? 0.75));

    const active: Component[] = ["popularity"];
    if (genres.size) active.push("genre");
    if (req.budgetMinutes) active.push("time");
    if (moods.size) active.push("mood");
    if (shelf.length) active.push("shelf");
    const weightSum = active.reduce((s, c) => s + WEIGHTS[c], 0);

    const candidates: Recommendation[] = [];
    for (const book of [...this.catalog].sort((a, b) => a.id.localeCompare(b.id))) {
      if (excluded.has(book.id)) continue;
      const minutes = readingMinutes(book, wpm);
      if (req.budgetMinutes && minutes > req.budgetMinutes * MAX_BUDGET_OVERRUN) continue;

      const components: Partial<Record<Component, number>> = { popularity: book.popularity };
      let nearestShelf: { id: string; sim: number } | null = null;
      if (genres.size) components.genre = genreScore(book, genres, this.idf);
      if (req.budgetMinutes) components.time = timeFit(minutes, req.budgetMinutes);
      if (moods.size) components.mood = book.moods.filter((m) => moods.has(m)).length / moods.size;
      if (shelf.length) {
        for (const id of shelf) {
          const sim = this.similarity(book.id, id);
          if (!nearestShelf || sim > nearestShelf.sim) nearestShelf = { id, sim };
        }
        components.shelf = nearestShelf!.sim;
      }
      // Only recommend books that actually share at least one requested genre.
      if (genres.size && components.genre === 0) continue;

      let score = 0;
      for (const c of active) score += (WEIGHTS[c] * (components[c] ?? 0)) / weightSum;
      score = round(score);
      candidates.push({
        book,
        score,
        readingMinutes: minutes,
        components,
        reasons: this.explain(book, components, { genres, moods, minutes, budget: req.budgetMinutes, nearestShelf, weightSum }),
      });
    }

    return this.diversify(candidates, limit, lambda);
  }

  /** Greedy Maximal Marginal Relevance selection. */
  private diversify(candidates: Recommendation[], limit: number, lambda: number): Recommendation[] {
    const pool = [...candidates].sort((a, b) => b.score - a.score || a.book.id.localeCompare(b.book.id));
    const picked: Recommendation[] = [];
    while (picked.length < limit && pool.length) {
      let bestIdx = 0;
      let bestValue = -Infinity;
      for (let i = 0; i < pool.length; i++) {
        const redundancy = picked.reduce((m, p) => Math.max(m, this.similarity(pool[i].book.id, p.book.id)), 0);
        const value = round(lambda * pool[i].score - (1 - lambda) * redundancy);
        // pool is pre-sorted by (score desc, id asc), so strict > keeps the tie-break.
        if (value > bestValue) {
          bestValue = value;
          bestIdx = i;
        }
      }
      picked.push(pool.splice(bestIdx, 1)[0]);
    }
    return picked;
  }

  private explain(
    book: Book,
    c: Partial<Record<Component, number>>,
    ctx: {
      genres: Set<string>;
      moods: Set<string>;
      minutes: number;
      budget?: number;
      nearestShelf: { id: string; sim: number } | null;
      weightSum: number;
    },
  ): Reason[] {
    const reasons: Reason[] = [];
    const contribution = (k: Component) => round(((c[k] ?? 0) * WEIGHTS[k]) / ctx.weightSum);

    if (c.genre) {
      const matched = book.genres.filter((g) => ctx.genres.has(g));
      reasons.push({ component: "genre", text: `Matches your ${matched.map((g) => g.replace(/-/g, " ")).join(" & ")} preference`, contribution: contribution("genre") });
    }
    if (ctx.budget && c.time !== undefined) {
      const fits = ctx.minutes <= ctx.budget;
      reasons.push({
        component: "time",
        text: fits
          ? `About ${formatMinutes(ctx.minutes)} to read, within your ${formatMinutes(ctx.budget)} budget`
          : `About ${formatMinutes(ctx.minutes)} to read, a little over your ${formatMinutes(ctx.budget)} budget`,
        contribution: contribution("time"),
      });
    }
    if (c.mood) {
      const matched = book.moods.filter((m) => ctx.moods.has(m));
      reasons.push({ component: "mood", text: `Feels ${matched.join(" and ")}`, contribution: contribution("mood") });
    }
    if (ctx.nearestShelf && ctx.nearestShelf.sim >= 0.35) {
      const title = this.catalog.find((b) => b.id === ctx.nearestShelf!.id)?.title;
      reasons.push({ component: "shelf", text: `Similar to "${title}" on your shelf`, contribution: contribution("shelf") });
    }
    if (book.popularity >= 0.85 && reasons.length < 2) {
      reasons.push({ component: "popularity", text: "Widely read and well regarded", contribution: contribution("popularity") });
    }
    return reasons.sort((a, b) => b.contribution - a.contribution);
  }
}
