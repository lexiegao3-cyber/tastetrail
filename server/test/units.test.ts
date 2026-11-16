import { describe, expect, it } from "vitest";
import { parseIngredient } from "../src/etl/parseIngredient.js";
import { parseCsvLine } from "../src/etl/importRecipeNLG.js";
import { mealTarget, mmr, rank, type RankContext } from "../src/ranking/engine.js";
import { haversineKm, isOpen, recommendGroup, travelMinutes, type GroupQuery } from "../src/ranking/group.js";
import { bannedFlags, easter, isLentFriday, NO_RESTRICTIONS, unionRestrictions, violatesCombination } from "../src/ranking/restrictions.js";
import { DEFAULT_PREFERENCES, type Candidate, type RestaurantRow } from "../src/repository.js";

describe("dietary restrictions", () => {
  it("compiles the three classes into banned ingredient flags", () => {
    const banned = bannedFlags({ diet: "vegan", allergens: ["peanut"], religious: [], other: [] });
    expect(banned).toEqual(expect.arrayContaining(["meat", "fish", "egg", "dairy", "honey", "a:peanut"]));
    expect(bannedFlags({ ...NO_RESTRICTIONS, diet: "pescatarian" })).not.toContain("fish");
    expect(bannedFlags({ ...NO_RESTRICTIONS, religious: ["halal"] })).toEqual(["alcohol", "gelatin", "pork"]);
    expect(bannedFlags({ ...NO_RESTRICTIONS, religious: ["jain"] })).toEqual(expect.arrayContaining(["root", "allium"]));
    expect(bannedFlags({ ...NO_RESTRICTIONS, other: ["gluten-free"] })).toEqual(["a:wheat"]);
  });

  it("applies Lent rules only on Lent Fridays", () => {
    expect(easter(2026).toISOString().slice(0, 10)).toBe("2026-04-05");
    expect(isLentFriday(new Date("2026-03-06T12:00:00Z"))).toBe(true);
    expect(isLentFriday(new Date("2026-03-07T12:00:00Z"))).toBe(false); // Saturday
    expect(isLentFriday(new Date("2026-05-01T12:00:00Z"))).toBe(false); // after Easter
    const r = { ...NO_RESTRICTIONS, religious: ["lent-fridays" as const] };
    expect(bannedFlags(r, new Date("2026-03-06T12:00:00Z"))).toContain("meat");
    expect(bannedFlags(r, new Date("2026-05-01T12:00:00Z"))).toEqual([]);
  });

  it("flags kosher meat-with-dairy and merges a group's restrictions", () => {
    const kosher = { ...NO_RESTRICTIONS, religious: ["kosher" as const] };
    expect(violatesCombination(kosher, ["poultry", "dairy"])).toBe(true);
    expect(violatesCombination(kosher, ["poultry"])).toBe(false);
    const u = unionRestrictions([
      { ...NO_RESTRICTIONS, diet: "lacto", allergens: ["sesame"] },
      { ...NO_RESTRICTIONS, diet: "ovo", religious: ["halal"] },
    ]);
    expect(u.diet).toBe("vegan");
    expect(u.allergens).toEqual(["sesame"]);
    expect(u.religious).toEqual(["halal"]);
  });
});

describe("ingredient parser", () => {
  it.each([
    ["2 cups chopped onion", 2, "cup", "onion", 288],
    ["1 1/2 lb boneless skinless chicken breast", 1.5, "lb", "chicken breast", 680.4],
    ["3 cloves garlic, minced", 3, "clove", "garlic", 9],
    ["2 large eggs", 2, null, "eggs", 100],
    ["½ c. all-purpose flour", 0.5, "cup", "all-purpose flour", 63.6],
    ["1 (15 oz) can black beans, drained", 1, "can", "black beans", 425],
    ["salt to taste", null, null, "salt", null],
    ["1 tbsp olive oil", 1, "tbsp", "olive oil", 13.8],
  ])("%s", (raw, qty, unit, name, grams) => {
    const p = parseIngredient(raw);
    expect(p.quantity).toBe(qty);
    expect(p.unit).toBe(unit);
    expect(p.name).toBe(name);
    expect(p.grams).toBe(grams);
  });

  it("parses quoted CSV with doubled quotes", () => {
    expect(parseCsvLine('0,"Pie","[""1 c. sugar"", ""2 eggs""]",x')).toEqual(["0", "Pie", '["1 c. sugar", "2 eggs"]', "x"]);
  });
});

const cand = (id: string, o: Partial<Candidate> = {}): Candidate => ({
  id, title_en: id, title_zh: id, emoji: "🍽️", cuisine: "american", tags: [], minutes: 20, steps: 4, servings: 2, equipment: [],
  kcal: 600, protein: 30, carbs: 60, fat: 20, sat_fat: 5, sugar: 5, fiber: 5, sodium_mg: 600, cost_per_serving: 4, flags: [],
  n_ingredients: 5, have: 0, expiring: 0, missing_cost: 8, food_ids: [`${id}-a`, `${id}-b`], ...o,
});

const ctx = (o: Partial<RankContext> = {}): RankContext => ({
  prefs: DEFAULT_PREFERENCES, history: [], intake: { kcal: 0, protein: 0, meals: 0 }, cf: new Map(), popularity: new Map(),
  hour: 12, pantryEmpty: true, limit: 10, lambda: 1, ...o,
});

describe("recipe ranking", () => {
  it("aims the next meal at the remaining calories", () => {
    expect(mealTarget(DEFAULT_PREFERENCES, { kcal: 500, protein: 20, meals: 1 }, 12)).toEqual({ kcal: 750, protein: 35, mealsLeft: 2 });
    expect(mealTarget(DEFAULT_PREFERENCES, { kcal: 1900, protein: 20, meals: 3 }, 20).kcal).toBe(300);
  });

  it("is deterministic regardless of input order", () => {
    const list = [cand("a", { cuisine: "thai" }), cand("b", { minutes: 10 }), cand("c", { kcal: 1500 }), cand("d", { tags: ["quick"] })];
    const ids = (xs: Candidate[]) => rank(xs, ctx()).map((r) => r.recipe.id);
    expect(ids(list)).toEqual(ids([...list].reverse()));
  });

  it("rewards stated cuisines, pantry coverage and expiring food", () => {
    const prefs = { ...DEFAULT_PREFERENCES, cuisines: ["thai"] };
    const out = rank([cand("plain"), cand("thai", { cuisine: "thai" })], ctx({ prefs }));
    expect(out[0]!.recipe.id).toBe("thai");
    expect(out[0]!.reasons.map((r) => r.code)).toContain("taste.cuisine");

    const pantry = rank([cand("none"), cand("have", { have: 4, expiring: 2, missing_cost: 1 })], ctx({ pantryEmpty: false }));
    expect(pantry[0]!.recipe.id).toBe("have");
    expect(pantry[0]!.reasons.map((r) => r.code)).toContain("convenience.expiring");
  });

  it("penalises sugar and sodium only when the user opts in", () => {
    const salty = cand("salty", { sodium_mg: 2500 });
    const mild = cand("mild", { sodium_mg: 300 });
    const lowSodium = { ...DEFAULT_PREFERENCES, restrictions: { ...NO_RESTRICTIONS, other: ["low-sodium" as const] } };
    const out = rank([salty, mild], ctx({ prefs: lowSodium }));
    expect(out[0]!.recipe.id).toBe("mild");
    expect(out[1]!.reasons.some((r) => r.code === "warn.sodium")).toBe(true);
    const neutral = rank([salty, mild], ctx());
    expect(neutral[0]!.score).toBe(neutral[1]!.score);
  });

  it("drops factors with no signal and renormalises", () => {
    const [r] = rank([cand("x")], ctx());
    expect(Object.keys(r!.components).sort()).toEqual(["convenience", "nutrition", "price", "taste"]);
    const withCf = rank([cand("x")], ctx({ cf: new Map([["x", { sim: 0.4, seed: "y" }]]) }));
    expect(withCf[0]!.components.collaborative).toBe(0.8);
  });

  it("MMR trades relevance for variety", () => {
    const same = (id: string, s: number) => ({ recipe: cand(id, { food_ids: ["x", "y"] }), score: s, components: {}, reasons: [] });
    const other = { recipe: cand("o", { cuisine: "thai" }), score: 0.7, components: {}, reasons: [] };
    expect(mmr([same("a", 0.9), same("b", 0.85), other], 2, 1).map((r) => r.recipe.id)).toEqual(["a", "b"]);
    expect(mmr([same("a", 0.9), same("b", 0.85), other], 2, 0.5).map((r) => r.recipe.id)).toEqual(["a", "o"]);
  });
});

const place = (id: string, o: Partial<RestaurantRow> = {}): RestaurantRow => ({
  id, name: id, cuisine: "hotpot", lat: 42.351, lng: -71.063, price_min: 25, price_max: 40, rating: 4.5, review_count: 500,
  phone: "(555) 010-0000", open_hour: 11, close_hour: 23, attrs: { largeTables: true, vegetarian: true, reservable: true }, ...o,
});

const group = (o: Partial<GroupQuery> = {}): GroupQuery => ({
  participants: [
    { name: "A", origin: { lat: 42.3503, lng: -71.081 }, likes: ["hotpot"], avoids: [], restrictions: NO_RESTRICTIONS },
    { name: "B", origin: { lat: 42.3651, lng: -71.1037 }, likes: [], avoids: [], restrictions: NO_RESTRICTIONS },
  ],
  partySize: 8, theme: "birthday", budget: [30, 40], maxTravelMinutes: 40, hour: 19, limit: 5, ...o,
});

describe("group dining", () => {
  it("computes distances and opening hours", () => {
    expect(haversineKm({ lat: 42.3503, lng: -71.081 }, { lat: 42.3651, lng: -71.1037 })).toBeCloseTo(2.48, 1);
    expect(travelMinutes({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBe(5);
    expect(isOpen({ open_hour: 11, close_hour: 23 }, 22)).toBe(true);
    expect(isOpen({ open_hour: 11, close_hour: 23 }, 23)).toBe(false);
    expect(isOpen({ open_hour: 18, close_hour: 26 }, 1)).toBe(true);
  });

  it("removes places anyone would hate (average without misery)", () => {
    const rows = [place("hot"), place("bbq", { cuisine: "american-bbq" })];
    const q = group();
    q.participants[1]!.avoids = ["hotpot"];
    expect(recommendGroup(rows, q, new Map()).map((r) => r.restaurant.id)).toEqual(["bbq"]);
  });

  it("enforces hard filters: budget, hours, travel, vegetarian", () => {
    const rows = [
      place("pricey", { price_min: 60, price_max: 90 }),
      place("closed", { open_hour: 17, close_hour: 18 }),
      place("far", { lat: 42.6, lng: -71.4 }),
      place("noveg", { attrs: { largeTables: true } }),
      place("ok"),
    ];
    const q = group();
    q.participants[0]!.restrictions = { ...NO_RESTRICTIONS, diet: "vegan" };
    expect(recommendGroup(rows, q, new Map()).map((r) => r.restaurant.id)).toEqual(["ok"]);
  });

  it("prefers the place that is fair to the farthest person", () => {
    const near = place("near", { lat: 42.3577, lng: -71.0923 }); // between both origins
    const lopsided = place("lopsided", { lat: 42.3503, lng: -71.06 }); // close to A only
    const out = recommendGroup([lopsided, near], group(), new Map());
    expect(out[0]!.restaurant.id).toBe("near");
    expect(out[0]!.components.fairness).toBeGreaterThan(out[1]!.components.fairness);
  });
});
