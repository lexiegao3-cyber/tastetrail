import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { createHash } from "node:crypto";
import pg from "pg";
import { FOODS } from "../data/foods.js";
import { RECIPES } from "../data/recipes.js";
import { RESTAURANTS } from "../data/restaurants.js";

/** The only database surface the app uses: parameterized SQL plus transactions. */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/**
 * DATABASE_URL set → real PostgreSQL via node-postgres (production, Neon, etc.).
 * Otherwise → PGlite, PostgreSQL compiled to WASM, in memory or in a data dir.
 * Same SQL either way, so tests run the real query plans without a server.
 */
export async function openDatabase(opts: { url?: string; dataDir?: string } = {}): Promise<Db> {
  const db = opts.url ? postgresDb(opts.url) : await pgliteDb(opts.dataDir);
  await migrate(db);
  await seed(db);
  return db;
}

async function pgliteDb(dataDir?: string): Promise<Db> {
  const lite = await PGlite.create({ dataDir, extensions: { pg_trgm } });
  const wrap = (q: Pick<PGlite, "query">): Db => ({
    query: async <T>(text: string, params: unknown[] = []) => (await q.query<T>(text, params)).rows,
    transaction: (fn) => lite.transaction((tx) => fn(wrap(tx))),
    close: () => lite.close(),
  });
  return wrap(lite);
}

function postgresDb(url: string): Db {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  const wrapClient = (c: pg.PoolClient): Db => ({
    query: async <T>(text: string, params: unknown[] = []) => (await c.query(text, params)).rows as T[],
    transaction: (fn) => fn(wrapClient(c)),
    close: async () => c.release(),
  });
  return {
    query: async <T>(text: string, params: unknown[] = []) => (await pool.query(text, params)).rows as T[],
    transaction: async (fn) => {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const out = await fn(wrapClient(c));
        await c.query("COMMIT");
        return out;
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
    },
    close: () => pool.end(),
  };
}

/** Ordered, append-only migrations; each runs once inside a transaction. */
const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: "0001_init",
    sql: `
      CREATE EXTENSION IF NOT EXISTS pg_trgm;

      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE preferences (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE foods (
        id TEXT PRIMARY KEY,
        name_en TEXT NOT NULL,
        name_zh TEXT NOT NULL,
        kcal NUMERIC NOT NULL, protein NUMERIC NOT NULL, fat NUMERIC NOT NULL, sat_fat NUMERIC NOT NULL,
        carbs NUMERIC NOT NULL, sugar NUMERIC NOT NULL, fiber NUMERIC NOT NULL, sodium_mg NUMERIC NOT NULL,
        flags TEXT[] NOT NULL DEFAULT '{}',
        price_per_100g NUMERIC NOT NULL,
        shelf_days INTEGER NOT NULL
      );
      CREATE INDEX foods_name_trgm ON foods USING GIN (name_en gin_trgm_ops);

      CREATE TABLE recipes (
        id TEXT PRIMARY KEY,
        title_en TEXT NOT NULL,
        title_zh TEXT NOT NULL,
        emoji TEXT NOT NULL DEFAULT '🍽️',
        cuisine TEXT NOT NULL,
        tags TEXT[] NOT NULL DEFAULT '{}',
        minutes INTEGER NOT NULL CHECK (minutes > 0),
        steps INTEGER NOT NULL CHECK (steps > 0),
        servings INTEGER NOT NULL CHECK (servings > 0),
        equipment TEXT[] NOT NULL DEFAULT '{}',
        source TEXT NOT NULL DEFAULT 'demo'
      );
      CREATE INDEX recipes_title_trgm ON recipes USING GIN (title_en gin_trgm_ops);
      CREATE TABLE recipe_ingredients (
        recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        food_id TEXT NOT NULL REFERENCES foods(id),
        grams NUMERIC NOT NULL CHECK (grams > 0),
        raw_text TEXT,
        match_confidence REAL NOT NULL DEFAULT 1,
        PRIMARY KEY (recipe_id, food_id)
      );
      CREATE INDEX recipe_ingredients_food ON recipe_ingredients(food_id);

      -- Ratings imported from public datasets (e.g. Food.com) for item-item CF.
      CREATE TABLE external_ratings (
        source TEXT NOT NULL,
        user_key TEXT NOT NULL,
        recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        rating SMALLINT NOT NULL CHECK (rating BETWEEN 0 AND 5),
        PRIMARY KEY (source, user_key, recipe_id)
      );
      CREATE INDEX external_ratings_recipe ON external_ratings(recipe_id);

      CREATE TABLE interactions (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('save', 'dismiss', 'cooked')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, recipe_id, kind)
      );

      CREATE TABLE meal_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        eaten_on DATE NOT NULL,
        recipe_id TEXT REFERENCES recipes(id) ON DELETE SET NULL,
        label TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('recipe', 'manual', 'takeout')),
        servings NUMERIC NOT NULL CHECK (servings > 0),
        kcal NUMERIC NOT NULL, protein NUMERIC NOT NULL, carbs NUMERIC NOT NULL, fat NUMERIC NOT NULL,
        sugar NUMERIC NOT NULL, sodium_mg NUMERIC NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX meal_logs_user_day ON meal_logs(user_id, eaten_on);

      CREATE TABLE pantry_items (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        food_id TEXT NOT NULL REFERENCES foods(id),
        grams NUMERIC NOT NULL CHECK (grams > 0),
        purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX pantry_user_food ON pantry_items(user_id, food_id);

      -- Every hand-off to an outside platform is an intent; the user confirms it on return.
      CREATE TABLE intents (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('grocery', 'takeout', 'restaurant')),
        provider TEXT NOT NULL,
        url TEXT NOT NULL,
        payload JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'declined')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        resolved_at TIMESTAMPTZ
      );
      CREATE INDEX intents_user_pending ON intents(user_id) WHERE status = 'pending';

      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        intent_id INTEGER UNIQUE REFERENCES intents(id) ON DELETE SET NULL,
        kind TEXT NOT NULL,
        provider TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('api', 'redirect-confirm', 'manual')),
        label TEXT NOT NULL,
        est_total_usd NUMERIC,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE restaurants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        cuisine TEXT NOT NULL,
        lat DOUBLE PRECISION NOT NULL,
        lng DOUBLE PRECISION NOT NULL,
        price_min NUMERIC NOT NULL,
        price_max NUMERIC NOT NULL,
        rating NUMERIC NOT NULL,
        review_count INTEGER NOT NULL,
        phone TEXT NOT NULL,
        open_hour NUMERIC NOT NULL,
        close_hour NUMERIC NOT NULL,
        attrs JSONB NOT NULL
      );
      CREATE TABLE restaurant_visits (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
        visited_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX restaurant_visits_user ON restaurant_visits(user_id);

      -- Stage 1 of the pipeline: per-serving nutrition, cost and ingredient flags.
      CREATE MATERIALIZED VIEW recipe_nutrition AS
      SELECT r.id AS recipe_id,
             round(sum(f.kcal * ri.grams / 100) / r.servings) AS kcal,
             round(sum(f.protein * ri.grams / 100) / r.servings, 1) AS protein,
             round(sum(f.carbs * ri.grams / 100) / r.servings, 1) AS carbs,
             round(sum(f.fat * ri.grams / 100) / r.servings, 1) AS fat,
             round(sum(f.sat_fat * ri.grams / 100) / r.servings, 1) AS sat_fat,
             round(sum(f.sugar * ri.grams / 100) / r.servings, 1) AS sugar,
             round(sum(f.fiber * ri.grams / 100) / r.servings, 1) AS fiber,
             round(sum(f.sodium_mg * ri.grams / 100) / r.servings) AS sodium_mg,
             round(sum(f.price_per_100g * ri.grams / 100) / r.servings, 2) AS cost_per_serving,
             count(*)::int AS n_ingredients,
             COALESCE((SELECT array_agg(DISTINCT fl ORDER BY fl)
                         FROM recipe_ingredients ri2
                         JOIN foods f2 ON f2.id = ri2.food_id
                         CROSS JOIN LATERAL unnest(f2.flags) AS fl
                        WHERE ri2.recipe_id = r.id), '{}') AS flags
        FROM recipes r
        JOIN recipe_ingredients ri ON ri.recipe_id = r.id
        JOIN foods f ON f.id = ri.food_id
       GROUP BY r.id, r.servings;
      CREATE UNIQUE INDEX recipe_nutrition_pk ON recipe_nutrition(recipe_id);
      CREATE INDEX recipe_nutrition_flags ON recipe_nutrition USING GIN (flags);
      CREATE INDEX recipe_nutrition_kcal ON recipe_nutrition(kcal);
    `,
  },
  {
    // Imported datasets (Food.com) publish per-serving nutrition but no ingredient
    // quantities. Their nutrition is stored as given; grams are category estimates
    // used only for pantry, shopping list and cost.
    id: "0002_imported_recipes",
    sql: `
      ALTER TABLE recipes ADD COLUMN nutrition JSONB;
      ALTER TABLE recipes ADD COLUMN quantities_estimated BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE foods ADD COLUMN category TEXT;
      ALTER TABLE external_ratings ADD COLUMN rated_on DATE;

      DROP MATERIALIZED VIEW recipe_nutrition;
      CREATE MATERIALIZED VIEW recipe_nutrition AS
      WITH computed AS (
        SELECT r.id AS recipe_id, r.servings, r.nutrition AS given,
               sum(f.kcal * ri.grams / 100) AS kcal, sum(f.protein * ri.grams / 100) AS protein,
               sum(f.carbs * ri.grams / 100) AS carbs, sum(f.fat * ri.grams / 100) AS fat,
               sum(f.sat_fat * ri.grams / 100) AS sat_fat, sum(f.sugar * ri.grams / 100) AS sugar,
               sum(f.fiber * ri.grams / 100) AS fiber, sum(f.sodium_mg * ri.grams / 100) AS sodium_mg,
               sum(f.price_per_100g * ri.grams / 100) AS cost,
               count(*)::int AS n_ingredients
          FROM recipes r
          JOIN recipe_ingredients ri ON ri.recipe_id = r.id
          JOIN foods f ON f.id = ri.food_id
         GROUP BY r.id
      ),
      recipe_flags AS (
        SELECT ri.recipe_id, array_agg(DISTINCT fl ORDER BY fl) AS flags
          FROM recipe_ingredients ri
          JOIN foods f ON f.id = ri.food_id
          CROSS JOIN LATERAL unnest(f.flags) AS fl
         GROUP BY ri.recipe_id
      )
      SELECT c.recipe_id,
             round(coalesce((given->>'kcal')::numeric, kcal / servings)) AS kcal,
             round(coalesce((given->>'protein')::numeric, protein / servings), 1) AS protein,
             round(coalesce((given->>'carbs')::numeric, carbs / servings), 1) AS carbs,
             round(coalesce((given->>'fat')::numeric, fat / servings), 1) AS fat,
             round(coalesce((given->>'sat_fat')::numeric, sat_fat / servings), 1) AS sat_fat,
             round(coalesce((given->>'sugar')::numeric, sugar / servings), 1) AS sugar,
             round(CASE WHEN given IS NULL THEN fiber / servings ELSE (given->>'fiber')::numeric END, 1) AS fiber,
             round(coalesce((given->>'sodium_mg')::numeric, sodium_mg / servings)) AS sodium_mg,
             round(cost / servings, 2) AS cost_per_serving,
             n_ingredients,
             coalesce(rf.flags, '{}') AS flags
        FROM computed c
        LEFT JOIN recipe_flags rf ON rf.recipe_id = c.recipe_id;
      CREATE UNIQUE INDEX recipe_nutrition_pk ON recipe_nutrition(recipe_id);
      CREATE INDEX recipe_nutrition_flags ON recipe_nutrition USING GIN (flags);
      CREATE INDEX recipe_nutrition_kcal ON recipe_nutrition(kcal);
    `,
  },
  {
    // Performance at Food.com scale (see docs/PERFORMANCE.md):
    // - likes per recipe (popularity and the CF degree) precomputed instead of
    //   aggregated per request;
    // - covering indexes so CF walks recipe → likers → their likes by index only.
    id: "0003_scale",
    sql: `
      CREATE MATERIALIZED VIEW recipe_popularity AS
      SELECT recipe_id, count(*)::int AS n FROM (
        SELECT recipe_id FROM external_ratings WHERE rating >= 4
        UNION ALL
        SELECT recipe_id FROM interactions WHERE kind IN ('save', 'cooked')
      ) x GROUP BY recipe_id;
      CREATE UNIQUE INDEX recipe_popularity_pk ON recipe_popularity(recipe_id);
      CREATE INDEX recipe_popularity_n ON recipe_popularity(n DESC, recipe_id);

      DROP INDEX external_ratings_recipe;
      CREATE INDEX external_ratings_recipe ON external_ratings(recipe_id, rated_on DESC) INCLUDE (user_key, rating);
      CREATE INDEX external_ratings_user ON external_ratings(user_key, rated_on DESC) INCLUDE (recipe_id, rating);
      CREATE INDEX interactions_recipe ON interactions(recipe_id, kind) INCLUDE (user_id, created_at);
      DROP INDEX recipe_ingredients_food;
      CREATE INDEX recipe_ingredients_food ON recipe_ingredients(food_id) INCLUDE (recipe_id);
      CREATE INDEX recipes_title_zh_trgm ON recipes USING GIN (title_zh gin_trgm_ops);
      CREATE INDEX recipes_cuisine ON recipes(cuisine);

      CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

      -- JIT compilation costs more than it saves on these sub-second queries (about
      -- 0.9 s extra on the candidate query at Food.com scale), and the default
      -- random_page_cost (4, for spinning disks) makes the planner pick full scans
      -- over index lookups on SSD-backed hosts such as Neon. Applies to new sessions.
      DO $$ BEGIN EXECUTE format('ALTER DATABASE %I SET jit = off', current_database()); EXECUTE format('ALTER DATABASE %I SET random_page_cost = 1.1', current_database()); EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'planner settings not applied'; END $$;
    `,
  },
  {
    // Group polls, and visits that may point at a Google place ID (not a demo row).
    id: "0004_group_polls",
    sql: `
      ALTER TABLE restaurant_visits DROP CONSTRAINT restaurant_visits_restaurant_id_fkey;
      CREATE TABLE polls (
        id SERIAL PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        options JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE poll_votes (
        poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
        voter TEXT NOT NULL,
        option_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (poll_id, voter)
      );
    `,
  },
];

async function migrate(db: Db): Promise<void> {
  await db.query("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  const applied = new Set((await db.query<{ id: string }>("SELECT id FROM schema_migrations")).map((r) => r.id));
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    await db.transaction(async (tx) => {
      for (const stmt of splitSql(m.sql)) await tx.query(stmt);
      await tx.query("INSERT INTO schema_migrations (id) VALUES ($1)", [m.id]);
    });
  }
}

/** Splits on top-level semicolons (our migrations contain no functions or quoted ';'). */
const splitSql = (sql: string) =>
  sql
    .split(/;\s*$/m)
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);

/**
 * Upserts demo data so edits in code propagate on restart without touching user
 * data. Skipped when the seed is unchanged: at Food.com scale, rewriting it and
 * refreshing the views on every boot costs time and resets the visibility map
 * that index-only scans rely on.
 */
async function seed(db: Db): Promise<void> {
  const hash = createHash("sha256").update(JSON.stringify([FOODS, RECIPES, RESTAURANTS])).digest("hex");
  const [prev] = await db.query<{ value: string }>("SELECT value FROM app_meta WHERE key = 'seed_hash'");
  if (prev?.value === hash) return;
  await db.transaction(async (tx) => {
    for (const f of FOODS) {
      await tx.query(
        `INSERT INTO foods (id, name_en, name_zh, kcal, protein, fat, sat_fat, carbs, sugar, fiber, sodium_mg, flags, price_per_100g, shelf_days)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (id) DO UPDATE SET name_en=$2, name_zh=$3, kcal=$4, protein=$5, fat=$6, sat_fat=$7, carbs=$8,
           sugar=$9, fiber=$10, sodium_mg=$11, flags=$12, price_per_100g=$13, shelf_days=$14`,
        [f.id, f.en, f.zh, f.kcal, f.protein, f.fat, f.satFat, f.carbs, f.sugar, f.fiber, f.sodiumMg, f.flags, f.pricePer100g, f.shelfDays],
      );
    }
    for (const r of RECIPES) {
      await tx.query(
        `INSERT INTO recipes (id, title_en, title_zh, emoji, cuisine, tags, minutes, steps, servings, equipment)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO UPDATE SET title_en=$2, title_zh=$3, emoji=$4, cuisine=$5, tags=$6, minutes=$7, steps=$8, servings=$9, equipment=$10`,
        [r.id, r.en, r.zh, r.emoji, r.cuisine, r.tags, r.minutes, r.steps, r.servings, r.equipment],
      );
      await tx.query("DELETE FROM recipe_ingredients WHERE recipe_id = $1", [r.id]);
      for (const [foodId, grams] of r.ingredients) {
        await tx.query("INSERT INTO recipe_ingredients (recipe_id, food_id, grams) VALUES ($1, $2, $3)", [r.id, foodId, grams]);
      }
    }
    for (const x of RESTAURANTS) {
      await tx.query(
        `INSERT INTO restaurants (id, name, cuisine, lat, lng, price_min, price_max, rating, review_count, phone, open_hour, close_hour, attrs)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (id) DO UPDATE SET name=$2, cuisine=$3, lat=$4, lng=$5, price_min=$6, price_max=$7, rating=$8,
           review_count=$9, phone=$10, open_hour=$11, close_hour=$12, attrs=$13`,
        [x.id, x.name, x.cuisine, x.lat, x.lng, x.priceMin, x.priceMax, x.rating, x.reviewCount, x.phone, x.open, x.close, JSON.stringify(x.attrs)],
      );
    }
  });
  await refreshNutrition(db);
  await db.query(
    "INSERT INTO app_meta (key, value) VALUES ('seed_hash', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [hash],
  );
}

export async function refreshNutrition(db: Db): Promise<void> {
  await db.query("REFRESH MATERIALIZED VIEW recipe_nutrition");
  await refreshPopularity(db);
}

/** Popularity changes with every save; the server refreshes it on a timer (CONCURRENTLY keeps reads unblocked). */
export async function refreshPopularity(db: Db, concurrently = false): Promise<void> {
  await db.query(`REFRESH MATERIALIZED VIEW ${concurrently ? "CONCURRENTLY " : ""}recipe_popularity`);
}
