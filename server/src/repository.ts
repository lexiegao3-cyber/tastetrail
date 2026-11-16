import type { Db } from "./db/index.js";
import { NO_RESTRICTIONS, type Restrictions } from "./ranking/restrictions.js";
import type { Equipment, Goal, Mode } from "./vocab.js";

export interface Preferences {
  goal: Goal;
  mode: Mode;
  dailyKcal: number;
  proteinG: number;
  cuisines: string[];
  restrictions: Restrictions;
  equipment: Equipment[];
  maxMinutes: number;
  mealBudget: number;
  zip: string;
  area: string;
}

export const DEFAULT_PREFERENCES: Preferences = {
  goal: "maintain",
  mode: "everyday",
  dailyKcal: 2000,
  proteinG: 90,
  cuisines: [],
  restrictions: NO_RESTRICTIONS,
  equipment: ["stove", "microwave"],
  maxMinutes: 30,
  mealBudget: 10,
  zip: "",
  area: "back-bay",
};

export interface Candidate {
  id: string;
  title_en: string;
  title_zh: string;
  emoji: string;
  cuisine: string;
  tags: string[];
  minutes: number;
  steps: number;
  servings: number;
  equipment: string[];
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  sat_fat: number;
  sugar: number;
  fiber: number;
  sodium_mg: number;
  cost_per_serving: number;
  flags: string[];
  n_ingredients: number;
  have: number;
  expiring: number;
  missing_cost: number;
  food_ids: string[];
}

export interface HistoryItem {
  recipe_id: string;
  kind: "save" | "cooked";
  cuisine: string;
  tags: string[];
  food_ids: string[];
  title_en: string;
  title_zh: string;
}

export interface CandidateQuery {
  banned: string[];
  equipment: string[];
  maxMinutes: number;
  cuisine?: string;
  q?: string;
  limit?: number;
}

const NUTRITION_COLS = `n.kcal::float8 AS kcal, n.protein::float8 AS protein, n.carbs::float8 AS carbs, n.fat::float8 AS fat,
  n.sat_fat::float8 AS sat_fat, n.sugar::float8 AS sugar, n.fiber::float8 AS fiber, n.sodium_mg::float8 AS sodium_mg,
  n.cost_per_serving::float8 AS cost_per_serving, n.flags, n.n_ingredients`;

/** Thin data-access layer; every user-owned query is keyed by user id. */
export class Repository {
  constructor(private readonly db: Db) {}

  // ---- users & preferences -------------------------------------------------
  async createUser(email: string, passwordHash: string): Promise<number | null> {
    const rows = await this.db.query<{ id: number }>(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING RETURNING id",
      [email, passwordHash],
    );
    return rows[0]?.id ?? null;
  }

  async findUserByEmail(email: string) {
    const rows = await this.db.query<{ id: number; email: string; password_hash: string }>(
      "SELECT id, email, password_hash FROM users WHERE email = $1",
      [email],
    );
    return rows[0];
  }

  async findUserById(id: number) {
    return (await this.db.query<{ id: number; email: string }>("SELECT id, email FROM users WHERE id = $1", [id]))[0];
  }

  async getPreferences(userId: number): Promise<Preferences> {
    const rows = await this.db.query<{ data: Partial<Preferences> }>("SELECT data FROM preferences WHERE user_id = $1", [userId]);
    const saved = rows[0]?.data ?? {};
    return { ...DEFAULT_PREFERENCES, ...saved, restrictions: { ...NO_RESTRICTIONS, ...(saved.restrictions ?? {}) } };
  }

  async savePreferences(userId: number, p: Preferences): Promise<Preferences> {
    await this.db.query(
      `INSERT INTO preferences (user_id, data, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [userId, JSON.stringify(p)],
    );
    return p;
  }

  // ---- recommendation pipeline -----------------------------------------------
  /**
   * Stages 2–4 of the SQL pipeline in one parameterized statement:
   * hard filters on the materialized nutrition view (GIN on flags), pantry
   * coverage and missing-ingredient cost per candidate, coarse pre-sort.
   */
  async candidates(userId: number | null, q: CandidateQuery): Promise<Candidate[]> {
    return this.db.query<Candidate>(
      `WITH pantry AS (
         SELECT food_id, sum(grams) AS grams, min(expires_at) AS expires_at
           FROM pantry_items
          WHERE user_id = $1 AND expires_at > now()
          GROUP BY food_id
       ),
       cand AS (
         SELECT r.id, r.title_en, r.title_zh, r.emoji, r.cuisine, r.tags, r.minutes, r.steps, r.servings, r.equipment, ${NUTRITION_COLS}
           FROM recipes r
           JOIN recipe_nutrition n ON n.recipe_id = r.id
          WHERE NOT (n.flags && $2::text[])
            AND r.equipment <@ $3::text[]
            AND r.minutes <= $4
            AND ($5::text IS NULL OR r.cuisine = $5)
            AND ($6::text IS NULL OR r.title_en ILIKE '%' || $6 || '%' OR r.title_zh LIKE '%' || $6 || '%'
                 OR similarity(r.title_en, $6) > 0.25)
            AND NOT EXISTS (SELECT 1 FROM interactions i
                             WHERE i.user_id = $1 AND i.recipe_id = r.id AND i.kind = 'dismiss')
       ),
       cover AS (
         SELECT ri.recipe_id,
                count(*) FILTER (WHERE p.grams >= ri.grams * 0.5)::int AS have,
                count(*) FILTER (WHERE p.expires_at < now() + interval '3 days')::int AS expiring,
                round(sum(greatest(ri.grams - coalesce(p.grams, 0), 0) * f.price_per_100g / 100), 2)::float8 AS missing_cost,
                array_agg(ri.food_id ORDER BY ri.food_id) AS food_ids
           FROM recipe_ingredients ri
           JOIN cand c ON c.id = ri.recipe_id
           JOIN foods f ON f.id = ri.food_id
           LEFT JOIN pantry p ON p.food_id = ri.food_id
          GROUP BY ri.recipe_id
       )
       SELECT c.*, cv.have, cv.expiring, cv.missing_cost, cv.food_ids
         FROM cand c
         JOIN cover cv ON cv.recipe_id = c.id
        ORDER BY cv.have::float8 / c.n_ingredients DESC, c.minutes ASC
        LIMIT $7`,
      [userId, q.banned, q.equipment, q.maxMinutes, q.cuisine ?? null, q.q?.trim() || null, q.limit ?? 200],
    );
  }

  /**
   * Item-item collaborative filtering in SQL: cosine similarity of co-likes
   * between the user's saved/cooked recipes and every other recipe, using
   * imported ratings (≥ 4 stars) plus other users' saves and cooks.
   */
  async itemSimilarity(userId: number): Promise<Map<string, { sim: number; seed: string; en: string; zh: string }>> {
    const rows = await this.db.query<{ cand: string; seed: string; sim: number; en: string; zh: string }>(
      `WITH likes AS (
         SELECT user_key, recipe_id FROM external_ratings WHERE rating >= 4
         UNION
         SELECT 'u' || user_id, recipe_id FROM interactions WHERE kind IN ('save', 'cooked') AND user_id <> $1
       ),
       mine AS (SELECT DISTINCT recipe_id FROM interactions WHERE user_id = $1 AND kind IN ('save', 'cooked')),
       deg AS (SELECT recipe_id, count(*)::float8 AS d FROM likes GROUP BY recipe_id),
       co AS (
         SELECT a.recipe_id AS seed, b.recipe_id AS cand, count(*)::float8 AS n
           FROM likes a
           JOIN likes b ON b.user_key = a.user_key AND b.recipe_id <> a.recipe_id
          WHERE a.recipe_id IN (SELECT recipe_id FROM mine)
          GROUP BY 1, 2
       )
       SELECT DISTINCT ON (co.cand) co.cand, co.seed, s.title_en AS en, s.title_zh AS zh, (co.n / sqrt(da.d * db.d))::float8 AS sim
         FROM co
         JOIN recipes s ON s.id = co.seed
         JOIN deg da ON da.recipe_id = co.seed
         JOIN deg db ON db.recipe_id = co.cand
        ORDER BY co.cand, sim DESC`,
      [userId],
    );
    return new Map(rows.map((r) => [r.cand, { sim: r.sim, seed: r.seed, en: r.en, zh: r.zh }]));
  }

  async history(userId: number): Promise<HistoryItem[]> {
    return this.db.query<HistoryItem>(
      `SELECT i.recipe_id, i.kind, r.cuisine, r.tags, r.title_en, r.title_zh,
              (SELECT array_agg(food_id ORDER BY food_id) FROM recipe_ingredients WHERE recipe_id = r.id) AS food_ids
         FROM interactions i JOIN recipes r ON r.id = i.recipe_id
        WHERE i.user_id = $1 AND i.kind IN ('save', 'cooked')
        ORDER BY i.created_at DESC LIMIT 100`,
      [userId],
    );
  }

  async popularity(): Promise<Map<string, number>> {
    const rows = await this.db.query<{ recipe_id: string; n: number }>(
      `SELECT recipe_id, count(*)::int AS n FROM (
         SELECT recipe_id FROM interactions WHERE kind IN ('save', 'cooked')
         UNION ALL SELECT recipe_id FROM external_ratings WHERE rating >= 4) x GROUP BY recipe_id`,
    );
    return new Map(rows.map((r) => [r.recipe_id, r.n]));
  }

  // ---- recipes -------------------------------------------------------------------
  async listRecipes() {
    return this.db.query(
      `SELECT r.id, r.title_en, r.title_zh, r.emoji, r.cuisine, r.tags, r.minutes, r.servings, ${NUTRITION_COLS}
         FROM recipes r JOIN recipe_nutrition n ON n.recipe_id = r.id ORDER BY r.id`,
    );
  }

  async recipe(id: string, userId: number | null) {
    const head = await this.db.query<Candidate>(
      `SELECT r.id, r.title_en, r.title_zh, r.emoji, r.cuisine, r.tags, r.minutes, r.steps, r.servings, r.equipment, ${NUTRITION_COLS}
         FROM recipes r JOIN recipe_nutrition n ON n.recipe_id = r.id WHERE r.id = $1`,
      [id],
    );
    if (!head[0]) return null;
    const ingredients = await this.db.query<{
      food_id: string; name_en: string; name_zh: string; grams: number; have_grams: number; price: number; flags: string[];
    }>(
      `SELECT ri.food_id, f.name_en, f.name_zh, ri.grams::float8 AS grams, f.flags,
              round(f.price_per_100g * ri.grams / 100, 2)::float8 AS price,
              coalesce((SELECT sum(p.grams) FROM pantry_items p
                         WHERE p.user_id = $2 AND p.food_id = ri.food_id AND p.expires_at > now()), 0)::float8 AS have_grams
         FROM recipe_ingredients ri JOIN foods f ON f.id = ri.food_id
        WHERE ri.recipe_id = $1 ORDER BY ri.grams DESC`,
      [id, userId],
    );
    const mine = userId
      ? await this.db.query<{ kind: string }>("SELECT kind FROM interactions WHERE user_id = $1 AND recipe_id = $2", [userId, id])
      : [];
    return { ...head[0], ingredients, saved: mine.some((m) => m.kind === "save") };
  }

  async recipeExists(id: string) {
    return (await this.db.query("SELECT 1 FROM recipes WHERE id = $1", [id])).length > 0;
  }

  // ---- interactions ----------------------------------------------------------------
  /** Composite primary key makes repeated saves idempotent; returns whether a row was created. */
  async addInteraction(userId: number, recipeId: string, kind: "save" | "dismiss" | "cooked"): Promise<boolean> {
    const rows = await this.db.query(
      `INSERT INTO interactions (user_id, recipe_id, kind) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, recipe_id, kind) DO UPDATE SET created_at = now()
       RETURNING (xmax = 0) AS inserted`,
      [userId, recipeId, kind],
    );
    if (kind === "save") await this.removeInteraction(userId, recipeId, "dismiss");
    return Boolean((rows[0] as { inserted?: boolean })?.inserted);
  }

  async removeInteraction(userId: number, recipeId: string, kind: string) {
    const rows = await this.db.query("DELETE FROM interactions WHERE user_id = $1 AND recipe_id = $2 AND kind = $3 RETURNING 1", [userId, recipeId, kind]);
    return rows.length > 0;
  }

  async saved(userId: number) {
    return this.db.query(
      `SELECT r.id, r.title_en, r.title_zh, r.emoji, r.cuisine, r.minutes, n.kcal::float8 AS kcal, n.protein::float8 AS protein
         FROM interactions i JOIN recipes r ON r.id = i.recipe_id JOIN recipe_nutrition n ON n.recipe_id = r.id
        WHERE i.user_id = $1 AND i.kind = 'save' ORDER BY i.created_at DESC`,
      [userId],
    );
  }

  // ---- meal logs ------------------------------------------------------------------------
  async logRecipe(userId: number, recipeId: string, servings: number, day: string) {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.query<{ id: number }>(
        `INSERT INTO meal_logs (user_id, eaten_on, recipe_id, label, source, servings, kcal, protein, carbs, fat, sugar, sodium_mg)
         SELECT $1, $4::date, r.id, r.title_en, 'recipe', $3, n.kcal * $3, n.protein * $3, n.carbs * $3, n.fat * $3, n.sugar * $3, n.sodium_mg * $3
           FROM recipes r JOIN recipe_nutrition n ON n.recipe_id = r.id WHERE r.id = $2
         RETURNING id`,
        [userId, recipeId, servings, day],
      );
      await tx.query(
        "INSERT INTO interactions (user_id, recipe_id, kind) VALUES ($1, $2, 'cooked') ON CONFLICT (user_id, recipe_id, kind) DO UPDATE SET created_at = now()",
        [userId, recipeId],
      );
      // Consume the ingredients from the virtual pantry, oldest first.
      const used = await tx.query<{ food_id: string; grams: number }>(
        `SELECT ri.food_id, (ri.grams * $2::numeric / r.servings)::float8 AS grams
           FROM recipe_ingredients ri JOIN recipes r ON r.id = ri.recipe_id WHERE ri.recipe_id = $1`,
        [recipeId, servings],
      );
      for (const u of used) await consumePantry(tx, userId, u.food_id, u.grams);
      return row!.id;
    });
  }

  async logManual(userId: number, m: { label: string; source: "manual" | "takeout"; kcal: number; protein: number; carbs: number; fat: number; sugar: number; sodiumMg: number }, day: string) {
    const [row] = await this.db.query<{ id: number }>(
      `INSERT INTO meal_logs (user_id, eaten_on, label, source, servings, kcal, protein, carbs, fat, sugar, sodium_mg)
       VALUES ($1, $2::date, $3, $4, 1, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [userId, day, m.label, m.source, m.kcal, m.protein, m.carbs, m.fat, m.sugar, m.sodiumMg],
    );
    return row!.id;
  }

  async mealLogs(userId: number, day: string) {
    return this.db.query(
      `SELECT l.id, l.recipe_id, l.label, l.source, l.servings::float8 AS servings, round(l.kcal)::float8 AS kcal,
              round(l.protein, 1)::float8 AS protein, round(l.carbs, 1)::float8 AS carbs, round(l.fat, 1)::float8 AS fat,
              round(l.sugar, 1)::float8 AS sugar, round(l.sodium_mg)::float8 AS sodium_mg, r.title_zh, r.emoji
         FROM meal_logs l LEFT JOIN recipes r ON r.id = l.recipe_id
        WHERE l.user_id = $1 AND l.eaten_on = $2::date ORDER BY l.created_at`,
      [userId, day],
    );
  }

  async dayTotals(userId: number, day: string) {
    const [t] = await this.db.query<{ kcal: number; protein: number; carbs: number; fat: number; sugar: number; sodium_mg: number; meals: number }>(
      `SELECT coalesce(sum(kcal), 0)::float8 AS kcal, coalesce(sum(protein), 0)::float8 AS protein,
              coalesce(sum(carbs), 0)::float8 AS carbs, coalesce(sum(fat), 0)::float8 AS fat,
              coalesce(sum(sugar), 0)::float8 AS sugar, coalesce(sum(sodium_mg), 0)::float8 AS sodium_mg, count(*)::int AS meals
         FROM meal_logs WHERE user_id = $1 AND eaten_on = $2::date`,
      [userId, day],
    );
    return t!;
  }

  async deleteMealLog(userId: number, id: number) {
    return (await this.db.query("DELETE FROM meal_logs WHERE id = $1 AND user_id = $2 RETURNING 1", [id, userId])).length > 0;
  }

  // ---- pantry ---------------------------------------------------------------------------
  async pantry(userId: number) {
    return this.db.query(
      `SELECT p.id, p.food_id, f.name_en, f.name_zh, p.grams::float8 AS grams, p.purchased_at, p.expires_at,
              greatest(0, ceil(extract(epoch FROM p.expires_at - now()) / 86400))::int AS days_left
         FROM pantry_items p JOIN foods f ON f.id = p.food_id
        WHERE p.user_id = $1 AND p.expires_at > now() ORDER BY p.expires_at`,
      [userId],
    );
  }

  async addPantry(userId: number, foodId: string, grams: number, db: Db = this.db) {
    const [row] = await db.query<{ id: number }>(
      `INSERT INTO pantry_items (user_id, food_id, grams, expires_at)
       SELECT $1, f.id, $3, now() + make_interval(days => f.shelf_days) FROM foods f WHERE f.id = $2 RETURNING id`,
      [userId, foodId, grams],
    );
    return row?.id ?? null;
  }

  async deletePantry(userId: number, id: number) {
    return (await this.db.query("DELETE FROM pantry_items WHERE id = $1 AND user_id = $2 RETURNING 1", [id, userId])).length > 0;
  }

  /** Trigram search over food names (the same pg_trgm index the ETL uses for matching). */
  async searchFoods(q: string, limit = 8) {
    return this.db.query(
      `SELECT id, name_en, name_zh, similarity(name_en, $1)::float8 AS score
         FROM foods
        WHERE name_en % $1 OR name_en ILIKE '%' || $1 || '%' OR name_zh LIKE '%' || $1 || '%'
        ORDER BY score DESC, name_en LIMIT $2`,
      [q, limit],
    );
  }

  async foodsExist(ids: string[]) {
    const rows = await this.db.query<{ id: string }>("SELECT id FROM foods WHERE id = ANY($1::text[])", [ids]);
    return rows.length === new Set(ids).size;
  }

  // ---- shopping & hand-offs ---------------------------------------------------------------
  /** Missing grams per food across recipes, net of what the pantry already holds. */
  async shoppingList(userId: number, recipeIds: string[]) {
    return this.db.query<{ food_id: string; name_en: string; name_zh: string; grams: number; est_usd: number; recipes: string[] }>(
      `WITH need AS (
         SELECT ri.food_id, sum(ri.grams) AS grams, array_agg(DISTINCT ri.recipe_id) AS recipes
           FROM recipe_ingredients ri WHERE ri.recipe_id = ANY($2::text[]) GROUP BY ri.food_id
       ),
       have AS (SELECT food_id, sum(grams) AS grams FROM pantry_items WHERE user_id = $1 AND expires_at > now() GROUP BY food_id)
       SELECT n.food_id, f.name_en, f.name_zh,
              ceil(greatest(n.grams - coalesce(h.grams, 0), 0))::float8 AS grams,
              round(greatest(n.grams - coalesce(h.grams, 0), 0) * f.price_per_100g / 100, 2)::float8 AS est_usd,
              n.recipes
         FROM need n JOIN foods f ON f.id = n.food_id LEFT JOIN have h ON h.food_id = n.food_id
        WHERE n.grams - coalesce(h.grams, 0) > 0
        ORDER BY f.name_en`,
      [userId, recipeIds],
    );
  }

  async createIntent(userId: number, kind: string, provider: string, url: string, payload: unknown) {
    const [row] = await this.db.query<{ id: number }>(
      "INSERT INTO intents (user_id, kind, provider, url, payload) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [userId, kind, provider, url, JSON.stringify(payload)],
    );
    return row!.id;
  }

  async pendingIntents(userId: number) {
    return this.db.query(
      "SELECT id, kind, provider, url, payload, created_at FROM intents WHERE user_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 5",
      [userId],
    );
  }

  /** Turns a confirmed hand-off into an order, pantry stock or a restaurant visit. */
  async resolveIntent(userId: number, intentId: number, confirmed: boolean) {
    return this.db.transaction(async (tx) => {
      const [intent] = await tx.query<{ id: number; kind: string; provider: string; payload: Record<string, unknown> }>(
        "UPDATE intents SET status = $3, resolved_at = now() WHERE id = $1 AND user_id = $2 AND status = 'pending' RETURNING id, kind, provider, payload",
        [intentId, userId, confirmed ? "confirmed" : "declined"],
      );
      if (!intent) return null;
      if (!confirmed) return { status: "declined" as const };
      const p = intent.payload as {
        label?: string; estTotal?: number; items?: { foodId: string; grams: number }[]; restaurantId?: string;
      };
      await tx.query(
        "INSERT INTO orders (user_id, intent_id, kind, provider, source, label, est_total_usd) VALUES ($1, $2, $3, $4, 'redirect-confirm', $5, $6)",
        [userId, intent.id, intent.kind, intent.provider, p.label ?? intent.kind, p.estTotal ?? null],
      );
      if (intent.kind === "grocery") for (const it of p.items ?? []) await this.addPantry(userId, it.foodId, it.grams, tx);
      if (intent.kind === "restaurant" && p.restaurantId) {
        await tx.query("INSERT INTO restaurant_visits (user_id, restaurant_id) VALUES ($1, $2)", [userId, p.restaurantId]);
      }
      return { status: "confirmed" as const, kind: intent.kind };
    });
  }

  // ---- restaurants --------------------------------------------------------------------------
  async restaurants() {
    return this.db.query<RestaurantRow>(
      `SELECT id, name, cuisine, lat, lng, price_min::float8 AS price_min, price_max::float8 AS price_max,
              rating::float8 AS rating, review_count, phone, open_hour::float8 AS open_hour, close_hour::float8 AS close_hour, attrs
         FROM restaurants`,
    );
  }

  async restaurantVisits(userId: number) {
    const rows = await this.db.query<{ restaurant_id: string; n: number }>(
      "SELECT restaurant_id, count(*)::int AS n FROM restaurant_visits WHERE user_id = $1 GROUP BY restaurant_id",
      [userId],
    );
    return new Map(rows.map((r) => [r.restaurant_id, r.n]));
  }
}

export interface RestaurantRow {
  id: string;
  name: string;
  cuisine: string;
  lat: number;
  lng: number;
  price_min: number;
  price_max: number;
  rating: number;
  review_count: number;
  phone: string;
  open_hour: number;
  close_hour: number;
  attrs: Record<string, boolean>;
}

async function consumePantry(tx: Db, userId: number, foodId: string, grams: number) {
  let left = grams;
  const rows = await tx.query<{ id: number; grams: number }>(
    "SELECT id, grams::float8 AS grams FROM pantry_items WHERE user_id = $1 AND food_id = $2 AND expires_at > now() ORDER BY expires_at",
    [userId, foodId],
  );
  for (const r of rows) {
    if (left <= 0) break;
    if (r.grams <= left) {
      await tx.query("DELETE FROM pantry_items WHERE id = $1", [r.id]);
      left -= r.grams;
    } else {
      await tx.query("UPDATE pantry_items SET grams = grams - $2 WHERE id = $1", [r.id, left]);
      left = 0;
    }
  }
}
