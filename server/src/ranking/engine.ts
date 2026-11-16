import type { Candidate, HistoryItem, Preferences } from "../repository.js";

/**
 * Recipe ranking. Pure functions over rows the SQL pipeline already filtered, so
 * it is unit-testable without a database and deterministic for a given input.
 *
 * Six factors, initial weights from the food-choice literature (FCQ, Steptoe et
 * al. 1995: sensory appeal, health, convenience and price matter most). Factors
 * with no signal for this user are dropped and the rest renormalised.
 */
export const WEIGHTS = {
  taste: 0.25,
  nutrition: 0.2,
  convenience: 0.15,
  collaborative: 0.15,
  familiarity: 0.15,
  price: 0.1,
} as const;
export type Factor = keyof typeof WEIGHTS;

export interface Reason {
  code: string;
  factor: Factor | "warning" | "note";
  params?: Record<string, string | number>;
  weight: number;
}

export interface Ranked {
  recipe: Candidate;
  score: number;
  components: Partial<Record<Factor, number>>;
  reasons: Reason[];
}

export interface DayIntake {
  kcal: number;
  protein: number;
  meals: number;
}

export interface RankContext {
  prefs: Preferences;
  history: HistoryItem[];
  intake: DayIntake;
  cf: Map<string, { sim: number; seed: string; en?: string; zh?: string }>;
  popularity: Map<string, number>;
  /** Local hour, used to estimate how many meals are left today. */
  hour: number;
  pantryEmpty: boolean;
  limit: number;
  /** MMR λ: 1 = pure relevance, lower = more variety. */
  lambda?: number;
}

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;

/** Kcal the next meal should aim for, given what was eaten and the time of day. */
export function mealTarget(prefs: Preferences, intake: DayIntake, hour: number) {
  const mealsLeft = hour < 11 ? 3 : hour < 16 ? 2 : 1;
  const remaining = prefs.dailyKcal - intake.kcal;
  const kcal = remaining > 250 ? remaining / mealsLeft : 300;
  const protein = Math.max(15, (prefs.proteinG - intake.protein) / mealsLeft);
  return { kcal: Math.round(kcal), protein: Math.round(protein), mealsLeft };
}

/** Bell-shaped fit: full marks inside [lo, hi], Gaussian decay outside. */
function band(x: number, lo: number, hi: number, spread: number) {
  if (x >= lo && x <= hi) return 1;
  const d = x < lo ? lo - x : x - hi;
  return Math.exp(-((d / spread) ** 2));
}

export function rank(candidates: Candidate[], ctx: RankContext): Ranked[] {
  const { prefs, history } = ctx;
  const target = mealTarget(prefs, ctx.intake, ctx.hour);

  // Taste profile: stated cuisines plus learned ones (cooked > saved).
  const cuisineW = new Map<string, number>();
  for (const c of prefs.cuisines) cuisineW.set(c, (cuisineW.get(c) ?? 0) + 1);
  for (const h of history) cuisineW.set(h.cuisine, (cuisineW.get(h.cuisine) ?? 0) + (h.kind === "cooked" ? 0.6 : 0.4));
  const maxCuisine = Math.max(0, ...cuisineW.values());
  const wantTags = prefs.mode === "fitness" ? ["high-protein", "meal-prep"] : ["quick", "budget"];

  // Familiarity: TF-IDF over cuisine, tags and ingredients of liked recipes.
  const docs = candidates.map(features);
  const idf = inverseDocFreq([...docs, ...history.map(features)]);
  const likedVecs = history.map((h) => ({ vec: tfidf(features(h), idf), h }));

  // Taste always has a signal: stated/learned cuisines, or at least the mode's tag fit.
  const active: Factor[] = ["taste", "nutrition", "convenience", "price"];
  if (ctx.cf.size > 0) active.push("collaborative");
  if (likedVecs.length > 0) active.push("familiarity");
  const totalW = active.reduce((s, f) => s + WEIGHTS[f], 0);

  const scored: Ranked[] = candidates.map((c, i) => {
    const comp: Partial<Record<Factor, number>> = {};
    const reasons: Reason[] = [];

    // 1. Taste
    const cuisineScore = maxCuisine > 0 ? (cuisineW.get(c.cuisine) ?? 0) / maxCuisine : 0.5;
    const tagScore = c.tags.some((t) => wantTags.includes(t)) ? 1 : 0.3;
    comp.taste = 0.7 * cuisineScore + 0.3 * tagScore;
    if (maxCuisine > 0 && cuisineScore >= 0.5) reasons.push({ code: "taste.cuisine", factor: "taste", params: { cuisine: c.cuisine }, weight: 0 });
    else if (tagScore === 1) reasons.push({ code: "taste.mode", factor: "taste", params: { mode: prefs.mode }, weight: 0 });

    // 2. Nutrition fit to the next meal, plus opt-in sugar / sodium preferences.
    const kcalFit = band(c.kcal, target.kcal * 0.7, target.kcal * 1.1, target.kcal * 0.35);
    const proteinFit = clamp(c.protein / target.protein);
    let nutrition = prefs.mode === "fitness" ? 0.5 * kcalFit + 0.5 * proteinFit : 0.75 * kcalFit + 0.25 * proteinFit;
    const other = prefs.restrictions.other;
    if (other.includes("low-sugar")) {
      nutrition *= band(c.sugar, 0, 10, 12);
      if (c.sugar > 10) reasons.push({ code: "warn.sugar", factor: "warning", params: { sugar: Math.round(c.sugar) }, weight: 0 });
    }
    if (other.includes("low-sodium")) {
      nutrition *= band(c.sodium_mg, 0, 770, 500);
      if (c.sodium_mg > 770) reasons.push({ code: "warn.sodium", factor: "warning", params: { sodium: Math.round(c.sodium_mg) }, weight: 0 });
    }
    comp.nutrition = nutrition;
    if (prefs.mode === "fitness" && proteinFit >= 0.8) {
      reasons.push({ code: "nutrition.protein", factor: "nutrition", params: { protein: Math.round(c.protein), target: target.protein }, weight: 0 });
    } else if (kcalFit >= 0.8) {
      reasons.push({ code: "nutrition.kcal", factor: "nutrition", params: { kcal: Math.round(c.kcal), target: target.kcal }, weight: 0 });
    }

    // 3. Convenience: cooking time (FCQ "takes no time") + what's already at home.
    const time = clamp(1 - c.minutes / (prefs.maxMinutes * 2));
    const coverage = c.have / c.n_ingredients;
    const pantry = clamp(coverage + 0.15 * Math.min(c.expiring, 2));
    comp.convenience = ctx.pantryEmpty ? time : 0.5 * time + 0.5 * pantry;
    if (c.expiring > 0) reasons.push({ code: "convenience.expiring", factor: "convenience", params: { count: c.expiring }, weight: 0 });
    else if (c.have > 0) reasons.push({ code: "convenience.pantry", factor: "convenience", params: { have: c.have, total: c.n_ingredients }, weight: 0 });
    else reasons.push({ code: "convenience.time", factor: "convenience", params: { minutes: c.minutes }, weight: 0 });

    // 4. Item-item collaborative filtering.
    const cf = ctx.cf.get(c.id);
    if (active.includes("collaborative")) {
      comp.collaborative = clamp((cf?.sim ?? 0) * 2);
      if (cf && cf.sim > 0.1) reasons.push({ code: "cf.alsoLiked", factor: "collaborative", params: { en: cf.en ?? cf.seed, zh: cf.zh ?? cf.seed }, weight: 0 });
    }

    // 5. Familiarity with what the user saved or cooked.
    if (likedVecs.length) {
      const v = tfidf(docs[i]!, idf);
      let best = 0;
      let bestH: HistoryItem | undefined;
      for (const l of likedVecs) {
        if (l.h.recipe_id === c.id) continue;
        const s = cosine(v, l.vec);
        if (s > best) [best, bestH] = [s, l.h];
      }
      comp.familiarity = best;
      if (bestH && best > 0.3) reasons.push({ code: "familiar.similar", factor: "familiarity", params: { en: bestH.title_en, zh: bestH.title_zh }, weight: 0 });
    }

    // 6. Price of what still has to be bought, per serving.
    const perServing = c.missing_cost / c.servings;
    comp.price = clamp(1 - Math.max(0, perServing - prefs.mealBudget * 0.5) / (prefs.mealBudget * 1.5));
    reasons.push({ code: "price.perServing", factor: "price", params: { usd: round(perServing, 2) }, weight: 0 });

    let score = 0;
    for (const f of active) score += (WEIGHTS[f] / totalW) * (comp[f] ?? 0);
    for (const r of reasons) if (r.factor in WEIGHTS) r.weight = round((WEIGHTS[r.factor as Factor] / totalW) * (comp[r.factor as Factor] ?? 0));
    if (needsCert(prefs, c)) reasons.push({ code: "note.certifiedMeat", factor: "note", weight: 0 });
    reasons.sort((a, b) => b.weight - a.weight);
    for (const f of Object.keys(comp) as Factor[]) comp[f] = round(comp[f]!);
    return { recipe: c, score: round(score, 4), components: comp, reasons };
  });

  // Deterministic order: score, then popularity, then id.
  scored.sort((a, b) => b.score - a.score || (ctx.popularity.get(b.recipe.id) ?? 0) - (ctx.popularity.get(a.recipe.id) ?? 0) || a.recipe.id.localeCompare(b.recipe.id));
  return mmr(scored, ctx.limit, ctx.lambda ?? 0.75);
}

const needsCert = (p: Preferences, c: Candidate) =>
  (p.restrictions.religious.includes("halal") || p.restrictions.religious.includes("kosher")) &&
  c.flags.some((f) => f === "meat" || f === "poultry");

/** Maximal Marginal Relevance: λ·relevance − (1−λ)·max similarity to picks so far. */
export function mmr(items: Ranked[], k: number, lambda: number): Ranked[] {
  const pool = [...items];
  const out: Ranked[] = [];
  while (out.length < k && pool.length) {
    let bestI = 0;
    let bestV = -Infinity;
    pool.forEach((c, i) => {
      const sim = out.length ? Math.max(...out.map((o) => recipeSimilarity(o.recipe, c.recipe))) : 0;
      const v = lambda * c.score - (1 - lambda) * sim;
      if (v > bestV + 1e-9) [bestV, bestI] = [v, i];
    });
    out.push(pool.splice(bestI, 1)[0]!);
  }
  return out;
}

export function recipeSimilarity(a: Pick<Candidate, "cuisine" | "food_ids">, b: Pick<Candidate, "cuisine" | "food_ids">) {
  const A = new Set(a.food_ids);
  const inter = b.food_ids.filter((f) => A.has(f)).length;
  const jac = inter / (A.size + b.food_ids.length - inter || 1);
  return 0.7 * jac + (a.cuisine === b.cuisine ? 0.3 : 0);
}

type Doc = string[];
const features = (r: { cuisine: string; tags: string[]; food_ids: string[] }): Doc => [`c:${r.cuisine}`, ...r.tags.map((t) => `t:${t}`), ...r.food_ids.map((f) => `f:${f}`)];

function inverseDocFreq(docs: Doc[]) {
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = new Map<string, number>();
  for (const [t, n] of df) idf.set(t, Math.log(1 + docs.length / n));
  return idf;
}

function tfidf(doc: Doc, idf: Map<string, number>) {
  const v = new Map<string, number>();
  for (const t of doc) v.set(t, idf.get(t) ?? 1);
  return v;
}

function cosine(a: Map<string, number>, b: Map<string, number>) {
  let dot = 0, na = 0, nb = 0;
  for (const [k, x] of a) {
    na += x * x;
    const y = b.get(k);
    if (y) dot += x * y;
  }
  for (const y of b.values()) nb += y * y;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
