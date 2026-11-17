/**
 * Offline evaluation of the ranking signals that can be measured on public
 * ratings: popularity, item-item collaborative filtering (the same cosine over
 * co-likes as Repository.itemSimilarity) and content familiarity (the engine's
 * TF-IDF over cuisine, tags and ingredients), plus a hybrid of the last two.
 *
 * Split: one global time cutoff. Everything before it is training data for every
 * model; a test user's relevant items are the recipes they rated >= threshold
 * after it. No model sees ratings from after the cutoff, so popularity and CF
 * cannot borrow from the future.
 */

export interface Rating {
  user: string;
  item: string;
  rating: number;
  date: string; // YYYY-MM-DD
}

export interface ItemFeatures {
  cuisine: string;
  tags: string[];
  foods: string[];
}

export interface SplitOptions {
  /** Fraction of ratings (by date) that go to training. */
  trainFraction?: number;
  threshold?: number;
  /** Test users need this many liked recipes before the cutoff to have a profile. */
  minTrainPositives?: number;
  maxUsers?: number;
  seed?: number;
}

export interface Split {
  cutoff: string;
  train: Rating[];
  testUsers: { user: string; history: string[]; relevant: Set<string> }[];
}

export function temporalSplit(ratings: Rating[], o: SplitOptions = {}): Split {
  const trainFraction = o.trainFraction ?? 0.8, threshold = o.threshold ?? 4, minTrain = o.minTrainPositives ?? 3;
  const dates = ratings.map((r) => r.date).sort();
  const cutoff = dates[Math.min(dates.length - 1, Math.floor(dates.length * trainFraction))] ?? "";
  const train = ratings.filter((r) => r.date < cutoff);
  const trainItems = new Set(train.map((r) => r.item));
  const before = new Map<string, Rating[]>(), after = new Map<string, Set<string>>();
  for (const r of ratings) {
    if (r.rating < threshold) continue;
    if (r.date < cutoff) push(before, r.user, r);
    // Only items that exist at training time can be recommended by any model here.
    else if (trainItems.has(r.item)) (after.get(r.user) ?? after.set(r.user, new Set()).get(r.user)!).add(r.item);
  }
  let users = [...after.keys()].filter((u) => (before.get(u)?.length ?? 0) >= minTrain).sort();
  users = seededShuffle(users, o.seed ?? 42).slice(0, o.maxUsers ?? 2000);
  return {
    cutoff,
    train,
    testUsers: users.map((u) => ({
      user: u,
      history: before.get(u)!.sort((a, b) => (a.date < b.date ? -1 : 1)).map((r) => r.item),
      relevant: after.get(u)!,
    })),
  };
}

export interface Model {
  name: string;
  recommend(user: { user: string; history: string[] }, k: number): string[];
}

/** Most-liked recipes in the training window. */
export function popularityModel(train: Rating[], threshold = 4): Model {
  const counts = new Map<string, number>();
  for (const r of train) if (r.rating >= threshold) counts.set(r.item, (counts.get(r.item) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([i]) => i);
  return {
    name: "Popularity",
    recommend: (u, k) => {
      const seen = new Set(u.history);
      const out: string[] = [];
      for (const i of ranked) {
        if (!seen.has(i)) out.push(i);
        if (out.length === k) break;
      }
      return out;
    },
  };
}

export interface CfOptions {
  threshold?: number;
  /** Recent seeds per user and history cap per co-rater keep power users from dominating cost. */
  maxSeeds?: number;
  maxCoRaterItems?: number;
}

/**
 * Item-item CF: sim(i, j) = |likers(i) ∩ likers(j)| / sqrt(|likers(i)| |likers(j)|).
 * A candidate's score is its best similarity to any seed, as in the app.
 */
export function itemCfScores(train: Rating[], o: CfOptions = {}) {
  const threshold = o.threshold ?? 4, maxSeeds = o.maxSeeds ?? 50, maxCo = o.maxCoRaterItems ?? 200;
  const likers = new Map<string, string[]>(), liked = new Map<string, string[]>();
  for (const r of [...train].sort((a, b) => (a.date < b.date ? 1 : -1))) {
    if (r.rating < threshold) continue;
    push(likers, r.item, r.user);
    push(liked, r.user, r.item);
  }
  return (history: string[]): Map<string, number> => {
    const seen = new Set(history);
    const best = new Map<string, number>();
    for (const seed of history.slice(-maxSeeds)) {
      const us = likers.get(seed);
      if (!us) continue;
      const co = new Map<string, number>();
      for (const u of us) for (const j of (liked.get(u) ?? []).slice(0, maxCo)) if (j !== seed) co.set(j, (co.get(j) ?? 0) + 1);
      for (const [j, n] of co) {
        if (seen.has(j)) continue;
        const sim = n / Math.sqrt(us.length * (likers.get(j)?.length ?? 1));
        if (sim > (best.get(j) ?? 0)) best.set(j, sim);
      }
    }
    return best;
  };
}

/**
 * Content familiarity: TF-IDF over cuisine, tags and ingredients, user profile =
 * sum of liked recipes' vectors, score = cosine. Features shared by more than
 * `maxDf` of the catalog (salt, "american") are dropped for speed; they barely
 * move cosine anyway.
 */
export function contentScores(features: Map<string, ItemFeatures>, o: { maxDf?: number; maxHistory?: number } = {}) {
  const docs = new Map<string, string[]>();
  for (const [id, f] of features) docs.set(id, [`c:${f.cuisine}`, ...f.tags.map((t) => `t:${t}`), ...f.foods.map((x) => `f:${x}`)]);
  const df = new Map<string, number>();
  for (const d of docs.values()) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const N = docs.size, maxDf = (o.maxDf ?? 0.05) * N;
  const idf = (t: string) => Math.log(1 + N / (df.get(t) ?? 1));
  const postings = new Map<string, string[]>();
  const norm = new Map<string, number>();
  for (const [id, d] of docs) {
    let s = 0;
    for (const t of new Set(d)) {
      s += idf(t) ** 2;
      if ((df.get(t) ?? 0) <= maxDf) push(postings, t, id);
    }
    norm.set(id, Math.sqrt(s));
  }
  return (history: string[]): Map<string, number> => {
    const profile = new Map<string, number>();
    for (const h of history.slice(-(o.maxHistory ?? 50))) for (const t of new Set(docs.get(h) ?? [])) profile.set(t, (profile.get(t) ?? 0) + idf(t));
    let pn = 0;
    for (const x of profile.values()) pn += x * x;
    pn = Math.sqrt(pn) || 1;
    const seen = new Set(history);
    const dot = new Map<string, number>();
    for (const [t, w] of profile) for (const id of postings.get(t) ?? []) if (!seen.has(id)) dot.set(id, (dot.get(id) ?? 0) + w * idf(t));
    const out = new Map<string, number>();
    for (const [id, d] of dot) out.set(id, d / (pn * (norm.get(id) || 1)));
    return out;
  };
}

/** Top-k by score, popularity breaking ties and filling when a model has too few candidates. */
export function scoredModel(name: string, score: (history: string[]) => Map<string, number>, fallback: Model): Model {
  return {
    name,
    recommend: (u, k) => {
      const s = score(u.history);
      const top = [...s.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, k).map(([i]) => i);
      if (top.length < k) {
        const have = new Set(top);
        for (const i of fallback.recommend(u, k * 2)) if (!have.has(i) && top.length < k) top.push(i);
      }
      return top;
    },
  };
}

/** Equal-weight blend of min-max normalized scores, mirroring the engine's equal CF/familiarity weights. */
export function blend(...parts: ((h: string[]) => Map<string, number>)[]) {
  return (history: string[]) => {
    const out = new Map<string, number>();
    for (const p of parts) {
      const s = p(history);
      let max = 0;
      for (const x of s.values()) if (x > max) max = x;
      if (max <= 0) continue;
      for (const [i, x] of s) out.set(i, (out.get(i) ?? 0) + x / max / parts.length);
    }
    return out;
  };
}

export interface Metrics {
  model: string;
  users: number;
  precision: number;
  recall: number;
  ndcg: number;
  hitRate: number;
  coverage: number;
}

export function evaluate(model: Model, split: Split, k = 10, catalogSize?: number): Metrics {
  let p = 0, r = 0, n = 0, hit = 0;
  const shown = new Set<string>();
  for (const u of split.testUsers) {
    const recs = model.recommend(u, k);
    for (const i of recs) shown.add(i);
    let hits = 0, dcg = 0;
    recs.forEach((i, rank) => {
      if (u.relevant.has(i)) (hits++, (dcg += 1 / Math.log2(rank + 2)));
    });
    let idcg = 0;
    for (let i = 0; i < Math.min(k, u.relevant.size); i++) idcg += 1 / Math.log2(i + 2);
    p += hits / k;
    r += hits / u.relevant.size;
    n += idcg ? dcg / idcg : 0;
    hit += hits > 0 ? 1 : 0;
  }
  const m = split.testUsers.length || 1;
  const catalog = catalogSize ?? new Set(split.train.map((x) => x.item)).size;
  return { model: model.name, users: split.testUsers.length, precision: p / m, recall: r / m, ndcg: n / m, hitRate: hit / m, coverage: shown.size / (catalog || 1) };
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const a = m.get(k);
  if (a) a.push(v);
  else m.set(k, [v]);
}

function seededShuffle<T>(xs: T[], seed: number): T[] {
  const a = [...xs];
  let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
