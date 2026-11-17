import { describe, expect, it } from "vitest";
import {
  blend, contentScores, evaluate, itemCfScores, popularityModel, scoredModel, temporalSplit, type Rating,
} from "../src/eval/offline.js";

/** Two taste clusters: users 0–29 like items a0–a9, users 30–59 like b0–b9; item p is liked by everyone. */
function clustered(): Rating[] {
  const out: Rating[] = [];
  let day = 0;
  const date = () => new Date(Date.UTC(2010, 0, 1 + Math.floor(day++ / 4))).toISOString().slice(0, 10);
  for (let round = 0; round < 10; round++) {
    for (let u = 0; u < 60; u++) {
      const group = u < 30 ? "a" : "b";
      out.push({ user: `u${u}`, item: `${group}${(u + round) % 10}`, rating: 5, date: date() });
      if (round === 0) out.push({ user: `u${u}`, item: "p", rating: 5, date: date() });
    }
  }
  return out;
}

describe("offline evaluation", () => {
  it("splits on one global time cutoff with no future leakage", () => {
    const s = temporalSplit(clustered(), { minTrainPositives: 3 });
    expect(s.train.every((r) => r.date < s.cutoff)).toBe(true);
    expect(s.testUsers.length).toBeGreaterThan(0);
    for (const u of s.testUsers) for (const i of u.relevant) expect(u.history).not.toContain(i);
  });

  it("computes precision, recall and NDCG", () => {
    const split = { cutoff: "", train: [], testUsers: [{ user: "x", history: [], relevant: new Set(["a", "c"]) }] };
    const m = evaluate({ name: "fixed", recommend: () => ["a", "b", "c", "d"] }, split, 4, 10);
    expect(m.precision).toBeCloseTo(0.5);
    expect(m.recall).toBeCloseTo(1);
    expect(m.ndcg).toBeCloseTo((1 + 1 / Math.log2(4)) / (1 + 1 / Math.log2(3)));
    expect(m.hitRate).toBe(1);
  });

  it("CF and content beat popularity when tastes cluster", () => {
    const ratings = clustered();
    const split = temporalSplit(ratings, { minTrainPositives: 3 });
    const pop = popularityModel(split.train);
    const features = new Map<string, { cuisine: string; tags: string[]; foods: string[] }>();
    for (let i = 0; i < 10; i++) {
      features.set(`a${i}`, { cuisine: "thai", tags: [], foods: [`fa${i}`, "fa"] });
      features.set(`b${i}`, { cuisine: "italian", tags: [], foods: [`fb${i}`, "fb"] });
    }
    features.set("p", { cuisine: "american", tags: [], foods: ["salt"] });
    const cf = scoredModel("cf", itemCfScores(split.train), pop);
    const content = scoredModel("content", contentScores(features, { maxDf: 1 }), pop);
    const hybrid = scoredModel("hybrid", blend(itemCfScores(split.train), contentScores(features, { maxDf: 1 })), pop);
    const p = evaluate(pop, split, 5);
    for (const m of [cf, content, hybrid]) expect(evaluate(m, split, 5).ndcg).toBeGreaterThan(p.ndcg);
  });
});
