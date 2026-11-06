import { describe, expect, it } from "vitest";
import { CATALOG } from "../src/catalog.js";
import { readingMinutes, Recommender, timeFit } from "../src/ranking/engine.js";

const rec = new Recommender(CATALOG);
const ids = (r: { book: { id: string } }[]) => r.map((x) => x.book.id);

describe("Recommender", () => {
  it("is deterministic for identical input, regardless of catalog order", () => {
    const req = { genres: ["science-fiction"], moods: ["reflective"], budgetMinutes: 600, limit: 8 };
    const a = rec.recommend(req);
    const b = new Recommender([...CATALOG].reverse()).recommend(req);
    expect(ids(a)).toEqual(ids(b));
    expect(a.map((x) => x.score)).toEqual(b.map((x) => x.score));
  });

  it("only returns books sharing a requested genre", () => {
    const out = rec.recommend({ genres: ["mystery"], limit: 20 });
    expect(out.length).toBeGreaterThan(0);
    for (const r of out) expect(r.book.genres).toContain("mystery");
  });

  it("excludes saved and dismissed books and uses the shelf as positive signal", () => {
    const shelf = ["dune", "three-body"];
    const out = rec.recommend({ shelf, dismissed: ["hail-mary"], limit: 50, lambda: 1 });
    expect(ids(out)).not.toContain("dune");
    expect(ids(out)).not.toContain("three-body");
    expect(ids(out)).not.toContain("hail-mary");
    // A science-fiction title should outrank an unrelated business book.
    expect(ids(out).indexOf("exhalation")).toBeLessThan(ids(out).indexOf("zero-one"));
    expect(out[0].reasons.some((r) => r.component === "shelf")).toBe(true);
  });

  it("respects the reading-time budget", () => {
    const budget = 240; // 4 hours
    const out = rec.recommend({ genres: ["fantasy"], budgetMinutes: budget, limit: 20 });
    for (const r of out) expect(r.readingMinutes).toBeLessThanOrEqual(budget * 2);
    expect(ids(out)).not.toContain("name-wind"); // ~12 h
    expect(out[0].readingMinutes).toBeLessThanOrEqual(budget);
  });

  it("diversity re-ranking reduces same-author repetition", () => {
    const relevanceOnly = rec.recommend({ genres: ["literary"], moods: ["reflective"], limit: 4, lambda: 1 });
    const diverse = rec.recommend({ genres: ["literary"], moods: ["reflective"], limit: 4, lambda: 0.5 });
    const authors = (r: typeof diverse) => new Set(r.map((x) => x.book.author)).size;
    expect(authors(diverse)).toBeGreaterThanOrEqual(authors(relevanceOnly));
    const genreSets = (r: typeof diverse) => new Set(r.flatMap((x) => x.book.genres)).size;
    expect(genreSets(diverse)).toBeGreaterThanOrEqual(genreSets(relevanceOnly));
  });

  it("explains recommendations from the components that drove them", () => {
    const [top] = rec.recommend({ genres: ["memoir"], moods: ["hopeful"], budgetMinutes: 480 });
    const texts = top.reasons.map((r) => r.text).join(" | ");
    expect(texts).toMatch(/memoir/);
    expect(texts).toMatch(/budget/);
    const contributions = top.reasons.map((r) => r.contribution);
    expect([...contributions].sort((a, b) => b - a)).toEqual(contributions);
  });

  it("computes reading time and a smooth budget fit", () => {
    const dune = CATALOG.find((b) => b.id === "dune")!;
    expect(readingMinutes(dune, 250)).toBe(757);
    expect(readingMinutes(dune, 500)).toBe(378);
    expect(timeFit(100, 100)).toBe(1);
    expect(timeFit(50, 100)).toBeCloseTo(0.925);
    expect(timeFit(150, 100)).toBeLessThan(0.2);
    expect(timeFit(120, 100)).toBeGreaterThan(timeFit(150, 100));
  });

  it("clamps the limit and handles an empty preference set", () => {
    expect(rec.recommend({ limit: 500 }).length).toBe(Math.min(50, CATALOG.length));
    expect(rec.recommend({ genres: ["horror"], budgetMinutes: 15 })).toEqual([]);
  });
});
