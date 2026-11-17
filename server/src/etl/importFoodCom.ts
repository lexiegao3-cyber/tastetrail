import { createReadStream } from "node:fs";
import { parse } from "csv-parse";
import type { Db } from "../db/index.js";
import { openDatabase, refreshNutrition } from "../db/index.js";
import { CATEGORY_DEFAULTS, classifyIngredient, type Category } from "./lexicon.js";

/**
 * Imports the Food.com Recipes and Interactions dataset (Majumder et al., EMNLP 2019;
 * Kaggle "shuyangli94/food-com-recipes-and-user-interactions").
 *
 *   npm run etl:foodcom -- --recipes RAW_recipes.csv --interactions RAW_interactions.csv [--limit N]
 *     [--min-ingredient-uses 5] [--all-courses]
 *
 * RAW_recipes lists ingredient names without quantities, so:
 *   - nutrition is taken from the dataset's own per-serving `nutrition` column;
 *   - ingredient names go through the keyword lexicon for restriction flags;
 *   - grams are category estimates, used only for pantry, shopping list and cost
 *     (recipes.quantities_estimated = true, shown as "estimated" in the UI).
 * Research/non-commercial use only. Do not commit the CSVs.
 */

/**
 * Reference daily values used to turn Food.com's %DV numbers into grams. Food.com's
 * convention is undocumented; these are the pre-2016 FDA label values (sugar has
 * no FDA DV, 50 g is the common assumption). Treat converted grams as approximate.
 */
export const DAILY_VALUES = { fat: 65, sugar: 50, sodium_mg: 2400, protein: 50, sat_fat: 20, carbs: 300 } as const;

const NON_MEAL_TAGS = new Set([
  "desserts", "beverages", "cocktails", "sauces", "condiments-etc", "jams-and-preserves", "candy",
  "cookies-and-brownies", "cakes", "pies-and-tarts", "frozen-desserts", "smoothies", "punch",
  "spreads", "dips", "marinades-and-rubs", "salad-dressings",
]);

const CUISINE_TAGS: [string[], string][] = [
  [["chinese"], "chinese"],
  [["japanese"], "japanese"],
  [["korean"], "korean"],
  [["thai"], "thai"],
  [["vietnamese"], "vietnamese"],
  [["indian"], "indian"],
  [["mexican", "tex-mex"], "mexican"],
  [["italian"], "italian"],
  [["greek", "mediterranean", "middle-eastern", "lebanese", "turkish", "moroccan", "spanish"], "mediterranean"],
];

const EMOJI: [RegExp, string][] = [
  [/\bsoup|stew|chili\b|chowder|gumbo/, "🍲"], [/salad/, "🥗"], [/pizza/, "🍕"], [/taco|burrito|enchilada|quesadilla|fajita/, "🌮"],
  [/curry|masala|dal\b/, "🍛"], [/burger/, "🍔"], [/sandwich|wrap|panini/, "🥪"], [/pancake|waffle|french toast/, "🥞"],
  [/omelet|frittata|scrambled|egg/, "🍳"], [/shrimp|prawn/, "🍤"], [/salmon|fish|tuna|cod|tilapia/, "🐟"],
  [/steak|beef|pork chop|ribs/, "🥩"], [/chicken|turkey/, "🍗"], [/pasta|spaghetti|lasagna|macaroni|penne|fettuccine/, "🍝"],
  [/noodle|ramen|pho|lo mein|pad thai/, "🍜"], [/rice|risotto|pilaf|paella/, "🍚"], [/bread|biscuit|muffin|scone/, "🍞"],
  [/oat|granola|cereal/, "🥣"], [/potato|fries/, "🥔"], [/smoothie|shake/, "🥤"], [/sushi/, "🍣"], [/dumpling|wonton|potsticker/, "🥟"],
];

/** Parses a Python list literal of strings, as written by pandas: ['a', "b's", 'c\'d']. */
export function parsePyList(s: string): string[] {
  const out: string[] = [];
  let i = s.indexOf("[") + 1;
  while (i > 0 && i < s.length) {
    const ch = s[i]!;
    if (ch === "'" || ch === '"') {
      let j = i + 1, buf = "";
      while (j < s.length && s[j] !== ch) {
        if (s[j] === "\\" && j + 1 < s.length) (buf += s[j + 1]), (j += 2);
        else (buf += s[j]), j++;
      }
      out.push(buf);
      i = j + 1;
    } else if (ch === "]") break;
    else i++;
  }
  return out;
}

export const parseNumberList = (s: string) => s.replace(/[[\]\s]/g, "").split(",").filter(Boolean).map(Number);

const titleCase = (s: string) => s.replace(/\s+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export interface ParsedRecipe {
  id: string;
  title: string;
  minutes: number;
  steps: number;
  tags: string[];
  cuisine: string;
  equipment: string[];
  emoji: string;
  ingredients: string[];
  nutrition: { kcal: number; fat: number; sugar: number; sodium_mg: number; protein: number; sat_fat: number; carbs: number; fiber: null };
}

/** Turns one RAW_recipes row into an app recipe, or a reason it is skipped. */
export function parseRecipeRow(row: Record<string, string>, allCourses = false): ParsedRecipe | { skip: string } {
  const sourceTags = parsePyList(row.tags ?? "");
  if (!allCourses && sourceTags.some((t) => NON_MEAL_TAGS.has(t))) return { skip: "not a meal" };
  const minutes = Number(row.minutes);
  const steps = Number(row.n_steps);
  if (!(minutes >= 1 && minutes <= 360) || !(steps >= 1)) return { skip: "time or steps out of range" };
  const n = parseNumberList(row.nutrition ?? "");
  if (n.length !== 7 || n.some((x) => !Number.isFinite(x) || x < 0 || x > 1000)) return { skip: "bad nutrition" };
  const [kcal, fatDv, sugarDv, sodiumDv, proteinDv, satDv, carbsDv] = n as [number, number, number, number, number, number, number];
  if (kcal < 30 || kcal > 2500) return { skip: "bad nutrition" };
  const ingredients = [...new Set(parsePyList(row.ingredients ?? "").map((x) => x.toLowerCase().replace(/\s+/g, " ").trim()).filter(Boolean))];
  if (ingredients.length < 2) return { skip: "too few ingredients" };

  const nutrition = {
    kcal,
    fat: (fatDv * DAILY_VALUES.fat) / 100,
    sugar: (sugarDv * DAILY_VALUES.sugar) / 100,
    sodium_mg: (sodiumDv * DAILY_VALUES.sodium_mg) / 100,
    protein: (proteinDv * DAILY_VALUES.protein) / 100,
    sat_fat: (satDv * DAILY_VALUES.sat_fat) / 100,
    carbs: (carbsDv * DAILY_VALUES.carbs) / 100,
    fiber: null,
  };
  const name = (row.name ?? "").trim() || "untitled recipe";
  const stepsText = (row.steps ?? "").toLowerCase();
  const has = (...t: string[]) => t.some((x) => sourceTags.includes(x));
  const tags = new Set<string>();
  if (has("breakfast", "brunch")) tags.add("breakfast");
  if (minutes <= 20) tags.add("quick");
  if (nutrition.protein >= 25 || has("high-protein")) tags.add("high-protein");
  if (has("oamc-freezer-make-ahead", "make-ahead")) tags.add("meal-prep");
  if (has("inexpensive")) tags.add("budget");
  if (has("spicy", "hot")) tags.add("spicy");
  if (has("comfort-food")) tags.add("comfort");
  const equipment = new Set<string>();
  if (has("oven") || /\b(bake|baking|oven|preheat|broil|roast)\b/.test(stepsText)) equipment.add("oven");
  if (has("microwave") || /\bmicrowave\b/.test(stepsText)) equipment.add("microwave");
  if (has("stove-top") || /\b(skillet|saucepan|frying pan|wok|pot|boil|simmer|saute|sauté|fry|stove|griddle)\b/.test(stepsText)) equipment.add("stove");
  const lower = name.toLowerCase();
  return {
    id: `fc:${row.id}`,
    title: titleCase(name),
    minutes,
    steps,
    tags: [...tags],
    cuisine: CUISINE_TAGS.find(([ts]) => has(...ts))?.[1] ?? "american",
    equipment: [...equipment].sort(),
    emoji: EMOJI.find(([re]) => re.test(lower))?.[1] ?? "🍽️",
    ingredients,
    nutrition,
  };
}

async function* csvRows(file: string): AsyncGenerator<Record<string, string>> {
  const parser = createReadStream(file).pipe(parse({ columns: true, relax_quotes: true, skip_records_with_error: true }));
  for await (const row of parser) yield row as Record<string, string>;
}

/** Multi-row insert through unnest(): one round trip per batch, same SQL on PGlite and node-postgres. */
async function insertBatches<T>(db: Db, rows: T[], size: number, sql: string, columns: (rows: T[]) => unknown[]) {
  for (let i = 0; i < rows.length; i += size) await db.query(sql, columns(rows.slice(i, i + size)));
}

export interface ImportOptions {
  recipes: string;
  interactions?: string;
  limit?: number;
  minIngredientUses?: number;
  allCourses?: boolean;
  log?: (msg: string) => void;
}

export async function importFoodCom(db: Db, o: ImportOptions) {
  const log = o.log ?? console.log;
  const minUses = o.minIngredientUses ?? 5;
  const stats = { rows: 0, skipped: {} as Record<string, number>, recipes: 0, foods: 0, ingredientLines: 0, ratings: 0, ratingRows: 0 };
  const skip = (why: string) => (stats.skipped[why] = (stats.skipped[why] ?? 0) + 1);

  // Pass 1: parse and count how often each ingredient name is used.
  const parsed: ParsedRecipe[] = [];
  const uses = new Map<string, number>();
  for await (const row of csvRows(o.recipes)) {
    stats.rows++;
    const r = parseRecipeRow(row, o.allCourses);
    if ("skip" in r) {
      skip(r.skip);
      continue;
    }
    parsed.push(r);
    for (const ing of r.ingredients) uses.set(ing, (uses.get(ing) ?? 0) + 1);
  }
  log(`read ${stats.rows} rows, ${parsed.length} meal recipes`);

  // Catalog: classify every ingredient once; rare names drop the recipes that use them.
  const catalog = new Map<string, { id: string; flags: string[]; category: Category } | null>();
  for (const [name, count] of uses) {
    const c = classifyIngredient(name);
    if (c.skip) catalog.set(name, null);
    else if (count >= minUses) catalog.set(name, { id: `fc:${slug(name)}`, flags: c.flags, category: c.category });
  }
  const kept: ParsedRecipe[] = [];
  for (const r of parsed) {
    if (r.ingredients.some((i) => catalog.get(i) === undefined)) skip("rare ingredient");
    else if (r.ingredients.filter((i) => catalog.get(i)).length < 2) skip("too few ingredients");
    else kept.push(r);
    if (o.limit && kept.length >= o.limit) break;
  }

  // Foods actually used by kept recipes (two names can share a slug: first one wins).
  const foods = new Map<string, { id: string; name: string; flags: string[]; category: Category }>();
  for (const r of kept) for (const i of r.ingredients) {
    const c = catalog.get(i);
    if (c && !foods.has(c.id)) foods.set(c.id, { ...c, name: i });
  }
  stats.foods = foods.size;
  stats.recipes = kept.length;
  log(`importing ${kept.length} recipes over ${foods.size} ingredients`);

  const foodList = [...foods.values()];
  await insertBatches(db, foodList, 2000,
    `INSERT INTO foods (id, name_en, name_zh, kcal, protein, fat, sat_fat, carbs, sugar, fiber, sodium_mg, flags, price_per_100g, shelf_days, category)
     SELECT id, name, name, 0, 0, 0, 0, 0, 0, 0, 0, string_to_array(flags, ','), price, shelf, cat
       FROM unnest($1::text[], $2::text[], $3::text[], $4::numeric[], $5::int[], $6::text[]) AS t(id, name, flags, price, shelf, cat)
     ON CONFLICT (id) DO UPDATE SET flags = EXCLUDED.flags, price_per_100g = EXCLUDED.price_per_100g,
       shelf_days = EXCLUDED.shelf_days, category = EXCLUDED.category`,
    (b) => [b.map((f) => f.id), b.map((f) => f.name), b.map((f) => f.flags.join(",")),
      b.map((f) => CATEGORY_DEFAULTS[f.category].price), b.map((f) => CATEGORY_DEFAULTS[f.category].shelfDays), b.map((f) => f.category)]);

  await insertBatches(db, kept, 2000,
    `INSERT INTO recipes (id, title_en, title_zh, emoji, cuisine, tags, minutes, steps, servings, equipment, source, nutrition, quantities_estimated)
     SELECT id, title, title, emoji, cuisine, string_to_array(tags, ','), minutes, steps, 4, string_to_array(equipment, ','), 'food.com', nutrition, true
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::int[], $7::int[], $8::text[], $9::jsonb[])
         AS t(id, title, emoji, cuisine, tags, minutes, steps, equipment, nutrition)
     ON CONFLICT (id) DO UPDATE SET title_en = EXCLUDED.title_en, title_zh = EXCLUDED.title_zh, emoji = EXCLUDED.emoji,
       cuisine = EXCLUDED.cuisine, tags = EXCLUDED.tags, minutes = EXCLUDED.minutes, steps = EXCLUDED.steps,
       equipment = EXCLUDED.equipment, nutrition = EXCLUDED.nutrition, quantities_estimated = true`,
    (b) => [b.map((r) => r.id), b.map((r) => r.title), b.map((r) => r.emoji), b.map((r) => r.cuisine), b.map((r) => r.tags.join(",")),
      b.map((r) => r.minutes), b.map((r) => r.steps), b.map((r) => r.equipment.join(",")), b.map((r) => JSON.stringify(r.nutrition))]);

  const lines: { recipe: string; food: string; grams: number; raw: string }[] = [];
  for (const r of kept) {
    const seen = new Set<string>();
    for (const i of r.ingredients) {
      const c = catalog.get(i);
      if (!c || seen.has(c.id)) continue;
      seen.add(c.id);
      lines.push({ recipe: r.id, food: c.id, grams: CATEGORY_DEFAULTS[c.category].grams, raw: i });
    }
  }
  stats.ingredientLines = lines.length;
  await db.query("DELETE FROM recipe_ingredients WHERE recipe_id = ANY($1::text[])", [kept.map((r) => r.id)]);
  await insertBatches(db, lines, 5000,
    `INSERT INTO recipe_ingredients (recipe_id, food_id, grams, raw_text, match_confidence)
     SELECT r, f, g, raw, 0.5 FROM unnest($1::text[], $2::text[], $3::numeric[], $4::text[]) AS t(r, f, g, raw)
     ON CONFLICT DO NOTHING`,
    (b) => [b.map((l) => l.recipe), b.map((l) => l.food), b.map((l) => l.grams), b.map((l) => l.raw)]);

  // Ratings: 0 means a review without a rating, so it is dropped.
  if (o.interactions) {
    const ids = new Set(kept.map((r) => r.id));
    let batch: { user: string; recipe: string; rating: number; date: string }[] = [];
    const flush = async () => {
      if (!batch.length) return;
      await db.query(
        `INSERT INTO external_ratings (source, user_key, recipe_id, rating, rated_on)
         SELECT 'food.com', u, r, x, d FROM unnest($1::text[], $2::text[], $3::smallint[], $4::date[]) AS t(u, r, x, d)
         ON CONFLICT (source, user_key, recipe_id) DO UPDATE SET rating = EXCLUDED.rating, rated_on = EXCLUDED.rated_on`,
        [batch.map((b) => b.user), batch.map((b) => b.recipe), batch.map((b) => b.rating), batch.map((b) => b.date)],
      );
      stats.ratings += batch.length;
      batch = [];
    };
    const seen = new Set<string>();
    for await (const row of csvRows(o.interactions)) {
      stats.ratingRows++;
      const recipe = `fc:${row.recipe_id}`;
      const rating = Number(row.rating);
      if (!ids.has(recipe) || !(rating >= 1 && rating <= 5) || !/^\d{4}-\d{2}-\d{2}$/.test(row.date ?? "")) continue;
      const key = `${row.user_id}|${recipe}`;
      if (seen.has(key)) continue; // one rating per user and recipe within a batch run
      seen.add(key);
      batch.push({ user: `fc:${row.user_id}`, recipe, rating, date: row.date! });
      if (batch.length >= 10_000) await flush();
    }
    await flush();
    log(`read ${stats.ratingRows} interactions, kept ${stats.ratings} ratings`);
  }

  await refreshNutrition(db);
  // VACUUM sets the visibility map so the covering indexes serve index-only scans.
  for (const t of ["recipes", "recipe_ingredients", "foods", "external_ratings", "recipe_nutrition", "recipe_popularity"]) {
    await db.query(`VACUUM (ANALYZE) ${t}`);
  }
  return stats;
}

if (process.argv[1]?.match(/importFoodCom\.[tj]s$/)) {
  const args = process.argv.slice(2);
  const opt = (k: string) => {
    const i = args.indexOf(`--${k}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const recipes = opt("recipes");
  if (!recipes) {
    console.error("Usage: npm run etl:foodcom -- --recipes RAW_recipes.csv [--interactions RAW_interactions.csv] [--limit N] [--min-ingredient-uses 5] [--all-courses]");
    process.exit(1);
  }
  const db = await openDatabase({ url: process.env.DATABASE_URL, dataDir: process.env.PLATEWISE_DATA_DIR ?? "./pgdata" });
  const t0 = Date.now();
  const stats = await importFoodCom(db, {
    recipes,
    interactions: opt("interactions"),
    limit: opt("limit") ? Number(opt("limit")) : undefined,
    minIngredientUses: opt("min-ingredient-uses") ? Number(opt("min-ingredient-uses")) : undefined,
    allCourses: args.includes("--all-courses"),
  });
  console.log(JSON.stringify({ ...stats, seconds: Math.round((Date.now() - t0) / 1000) }, null, 2));
  await db.close();
}
