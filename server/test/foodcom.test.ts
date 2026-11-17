import { describe, expect, it } from "vitest";
import { openDatabase } from "../src/db/index.js";
import { importFoodCom, parsePyList, parseRecipeRow } from "../src/etl/importFoodCom.js";

const dir = new URL("./fixtures/foodcom/", import.meta.url).pathname;

describe("Food.com parsing", () => {
  it("parses pandas-written Python list literals", () => {
    expect(parsePyList(`['a', "it's", 'c\\'d', 'x, y']`)).toEqual(["a", "it's", "c'd", "x, y"]);
    expect(parsePyList("[]")).toEqual([]);
  });

  it("converts %DV nutrition and infers tags, cuisine and equipment", () => {
    const r = parseRecipeRow({
      name: "beef and broccoli stir fry", id: "1", minutes: "20", n_steps: "2",
      tags: "['main-dish', 'chinese']", nutrition: "[420.0, 30.0, 10.0, 40.0, 70.0, 25.0, 6.0]",
      steps: "['heat oil in a wok']", ingredients: "['flank steak', 'broccoli']",
    });
    if ("skip" in r) throw new Error(r.skip);
    expect(r.cuisine).toBe("chinese");
    expect(r.nutrition.protein).toBeCloseTo(35);
    expect(r.nutrition.sodium_mg).toBeCloseTo(960);
    expect(r.tags).toEqual(expect.arrayContaining(["quick", "high-protein"]));
    expect(r.equipment).toEqual(["stove"]);
  });

  it("skips desserts unless asked", () => {
    const row = { name: "cookies", id: "2", minutes: "30", n_steps: "2", tags: "['desserts']", nutrition: "[150, 1, 1, 1, 1, 1, 1]", ingredients: "['flour', 'sugar']" };
    expect(parseRecipeRow(row)).toEqual({ skip: "not a meal" });
    expect("skip" in parseRecipeRow(row, true)).toBe(false);
  });
});

describe("Food.com import", () => {
  it("imports meal recipes, flags and dated ratings; uses the dataset's nutrition", async () => {
    const db = await openDatabase();
    const stats = await importFoodCom(db, {
      recipes: dir + "RAW_recipes.csv", interactions: dir + "RAW_interactions.csv", minIngredientUses: 1, log: () => undefined,
    });
    expect(stats.rows).toBe(5);
    expect(stats.skipped["not a meal"]).toBe(1);
    expect(stats.recipes).toBe(4);
    expect(stats.ratings).toBe(4); // dessert rating, the 0 rating are dropped

    const [beef] = await db.query<{ kcal: string; protein: string; flags: string[]; cost: string }>(
      "SELECT kcal, protein, flags, cost_per_serving AS cost FROM recipe_nutrition WHERE recipe_id = 'fc:1001'");
    expect(Number(beef!.kcal)).toBe(420);
    expect(Number(beef!.protein)).toBe(35);
    expect(beef!.flags).toEqual(expect.arrayContaining(["beef", "meat", "a:soy", "a:wheat", "allium"]));
    expect(Number(beef!.cost)).toBeGreaterThan(0);

    const [shrimp] = await db.query<{ flags: string[] }>("SELECT flags FROM recipe_nutrition WHERE recipe_id = 'fc:1004'");
    expect(shrimp!.flags).toEqual(expect.arrayContaining(["shellfish", "a:shellfish", "alcohol"]));
    const [riceNoodles] = await db.query<{ flags: string[] }>("SELECT flags FROM foods WHERE id = 'fc:rice-noodles'");
    expect(riceNoodles!.flags).not.toContain("a:wheat");
    const [noodles] = await db.query<{ flags: string[] }>("SELECT flags FROM recipe_nutrition WHERE recipe_id = 'fc:1003'");
    expect(noodles!.flags).toContain("a:wheat"); // from the soy sauce
    const water = await db.query("SELECT 1 FROM foods WHERE name_en = 'water'");
    expect(water).toHaveLength(0);
    const [r] = await db.query<{ rated_on: Date | string }>("SELECT rated_on FROM external_ratings WHERE user_key = 'fc:u2' AND recipe_id = 'fc:1001'");
    expect(String(r!.rated_on)).toMatch(/2011/);

    // Seed recipes still compute nutrition from ingredients.
    const [seed] = await db.query<{ kcal: string }>("SELECT kcal FROM recipe_nutrition WHERE recipe_id = 'tomato-egg'");
    expect(Number(seed!.kcal)).toBeGreaterThan(100);
    await db.close();
  });
});
