import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { openDatabase, refreshNutrition, type Db } from "../db/index.js";
import { parseIngredient } from "./parseIngredient.js";

/**
 * Imports recipes from the RecipeNLG CSV (title, ingredients, directions, ...).
 * Each free-text ingredient line is parsed to grams and matched to a food with
 * pg_trgm. A recipe is kept only if every ingredient that weighs something was
 * matched, so nutrition stays trustworthy; the run prints the match rate.
 *
 * Usage: npm run etl:recipenlg -- path/to/full_dataset.csv [--limit 5000]
 * RecipeNLG is for research / non-commercial use: do not commit the raw file.
 */

const MIN_SIMILARITY = 0.35;

/** Minimal RFC 4180 line parser (RecipeNLG rows have no embedded newlines). */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export async function matchFood(db: Db, name: string): Promise<{ id: string; confidence: number } | null> {
  if (!name) return null;
  const [row] = await db.query<{ id: string; s: number }>(
    "SELECT id, similarity(name_en, $1)::float8 AS s FROM foods ORDER BY name_en <-> $1 LIMIT 1",
    [name],
  );
  return row && row.s >= MIN_SIMILARITY ? { id: row.id, confidence: row.s } : null;
}

export async function importRecipeNLG(db: Db, file: string, limit = Infinity) {
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let header: string[] | null = null;
  let seen = 0, kept = 0, lines = 0, matched = 0;
  for await (const line of rl) {
    if (!header) {
      header = parseCsvLine(line);
      continue;
    }
    if (seen >= limit) break;
    seen++;
    const cols = parseCsvLine(line);
    const row = Object.fromEntries(header.map((h, i) => [h, cols[i] ?? ""]));
    let ingredients: string[], directions: string[];
    try {
      ingredients = JSON.parse(row.ingredients ?? "[]");
      directions = JSON.parse(row.directions ?? "[]");
    } catch {
      continue;
    }
    const parsed: (ReturnType<typeof parseIngredient> & { foodId: string; confidence: number })[] = [];
    let ok = true;
    for (const text of ingredients) {
      lines++;
      const p = parseIngredient(text);
      const m = await matchFood(db, p.name);
      if (m) matched++;
      if (!m || !p.grams) {
        if ((p.grams ?? 1) > 5) ok = false;
        continue;
      }
      parsed.push({ ...p, foodId: m.id, confidence: m.confidence });
    }
    if (!ok || parsed.length < 2) continue;
    const id = `nlg-${seen}`;
    await db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO recipes (id, title_en, title_zh, cuisine, minutes, steps, servings, source)
         VALUES ($1, $2, $2, 'american', $3, $4, 4, 'recipenlg') ON CONFLICT (id) DO NOTHING`,
        [id, (row.title ?? "Untitled").slice(0, 120), 10 + 5 * directions.length, Math.max(1, directions.length)],
      );
      const merged = new Map<string, (typeof parsed)[number]>();
      for (const p of parsed) {
        const prev = merged.get(p.foodId);
        merged.set(p.foodId, prev ? { ...p, grams: prev.grams! + p.grams! } : p);
      }
      for (const p of merged.values()) {
        await tx.query(
          "INSERT INTO recipe_ingredients (recipe_id, food_id, grams, raw_text, match_confidence) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
          [id, p.foodId, p.grams, p.raw, p.confidence],
        );
      }
    });
    kept++;
  }
  await refreshNutrition(db);
  return { seen, kept, ingredientLines: lines, matchRate: lines ? matched / lines : 0 };
}

if (process.argv[1]?.endsWith("importRecipeNLG.ts") || process.argv[1]?.endsWith("importRecipeNLG.js")) {
  const [file, flag, n] = process.argv.slice(2);
  if (!file) {
    console.error("Usage: npm run etl:recipenlg -- <full_dataset.csv> [--limit N]");
    process.exit(1);
  }
  const db = await openDatabase({ url: process.env.DATABASE_URL, dataDir: process.env.PLATEWISE_DATA_DIR ?? "./pgdata" });
  const stats = await importRecipeNLG(db, file, flag === "--limit" ? Number(n) : Infinity);
  console.log(JSON.stringify(stats, null, 2));
  await db.close();
}
