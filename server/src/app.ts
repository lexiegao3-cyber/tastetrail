import { randomBytes } from "node:crypto";
import express from "express";
import { z } from "zod";
import { authenticate, hashPassword, issueToken, verifyPassword, type AuthConfig } from "./auth.js";
import { NEIGHBORHOODS } from "./data/restaurants.js";
import type { Db } from "./db/index.js";
import { errorHandler, HttpError } from "./errors.js";
import { deepLinks, groceryProviders, type GroceryProvider } from "./providers/index.js";
import { demoRestaurants, googlePlaces, type RestaurantSource } from "./providers/places.js";
import { rank } from "./ranking/engine.js";
import { recommendGroup } from "./ranking/group.js";
import { planDayIlp } from "./ranking/mealplan.js";
import { bannedFlags, violatesCombination } from "./ranking/restrictions.js";
import { Repository, type Preferences } from "./repository.js";
import {
  ALLERGENS, CUISINES, DIETS, EQUIPMENT, GOALS, MODES, OTHER_DIETS, RELIGIOUS, RESTAURANT_CUISINES, TAGS, THEMES,
} from "./vocab.js";

const credentials = z.object({
  email: z.email().max(254).transform((e) => e.toLowerCase()),
  password: z.string().min(8).max(128),
});

const restrictionsSchema = z.object({
  diet: z.enum(DIETS).default("none"),
  allergens: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length).default([]),
  religious: z.array(z.enum(RELIGIOUS)).max(RELIGIOUS.length).default([]),
  other: z.array(z.enum(OTHER_DIETS)).max(OTHER_DIETS.length).default([]),
});

const preferencesBody = z.object({
  goal: z.enum(GOALS),
  mode: z.enum(MODES),
  dailyKcal: z.number().int().min(1200).max(4500),
  proteinG: z.number().int().min(20).max(300),
  cuisines: z.array(z.enum(CUISINES)).max(CUISINES.length),
  restrictions: restrictionsSchema,
  equipment: z.array(z.enum(EQUIPMENT)).max(EQUIPMENT.length),
  maxMinutes: z.number().int().min(5).max(120),
  mealBudget: z.number().min(2).max(100),
  zip: z.string().regex(/^(\d{5})?$/, "ZIP must be 5 digits"),
  area: z.enum(NEIGHBORHOODS.map((n) => n.id) as [string, ...string[]]),
});

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const clock = z.object({ day: day.optional(), hour: z.number().int().min(0).max(23).optional() });

const recommendBody = clock.extend({
  mode: z.enum(MODES).optional(),
  cuisine: z.enum(CUISINES).optional(),
  q: z.string().max(80).optional(),
  maxMinutes: z.number().int().min(5).max(120).optional(),
  limit: z.number().int().min(1).max(30).default(10),
  diversity: z.number().min(0).max(1).default(0.25),
});

const recipeIdBody = z.object({ recipeId: z.string().min(1).max(64) });
const interactionBody = recipeIdBody.extend({ kind: z.enum(["save", "dismiss"]) });

const mealLogBody = z.union([
  z.object({ recipeId: z.string().min(1).max(64), servings: z.number().min(0.25).max(6).default(1), day: day.optional() }),
  z.object({
    label: z.string().min(1).max(80),
    source: z.enum(["manual", "takeout"]).default("manual"),
    kcal: z.number().min(0).max(5000),
    protein: z.number().min(0).max(400).default(0),
    carbs: z.number().min(0).max(800).default(0),
    fat: z.number().min(0).max(400).default(0),
    sugar: z.number().min(0).max(400).default(0),
    sodiumMg: z.number().min(0).max(20000).default(0),
    day: day.optional(),
  }),
]);

const pantryBody = z.object({ foodId: z.string().min(1).max(64), grams: z.number().positive().max(20000) });
const recipeIdsBody = z.object({ recipeIds: z.array(z.string().min(1).max(64)).min(1).max(20) });
const checkoutBody = recipeIdsBody.extend({ provider: z.enum(["instacart", "kroger"]) });
const takeoutBody = z.object({ provider: z.enum(["doordash", "ubereats"]), query: z.string().min(1).max(80) });
const intentBody = z.object({ confirmed: z.boolean() });

const point = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const groupBody = z.object({
  partySize: z.number().int().min(2).max(30),
  theme: z.enum(THEMES),
  cuisine: z.enum(RESTAURANT_CUISINES).optional(),
  budget: z.tuple([z.number().min(0), z.number().max(500)]).refine(([a, b]) => a <= b, "budget min must be ≤ max"),
  maxTravelMinutes: z.number().int().min(5).max(120).default(30),
  hour: z.number().int().min(0).max(23),
  participants: z
    .array(
      z.object({
        name: z.string().min(1).max(40),
        origin: point,
        likes: z.array(z.enum(RESTAURANT_CUISINES)).max(12).default([]),
        avoids: z.array(z.enum(RESTAURANT_CUISINES)).max(12).default([]),
        restrictions: restrictionsSchema.default({ diet: "none", allergens: [], religious: [], other: [] }),
      }),
    )
    .min(1)
    .max(30),
  limit: z.number().int().min(1).max(10).default(5),
});
const restaurantVisitBody = z.object({
  restaurantId: z.string().min(1).max(300),
  name: z.string().max(120),
  mapsUrl: z.url({ protocol: /^https$/, hostname: /(^|\.)google\.com$/ }).optional(),
});
const pollBody = z.object({
  title: z.string().trim().min(1).max(80),
  options: z
    .array(z.object({
      id: z.string().min(1).max(300),
      name: z.string().min(1).max(120),
      cuisine: z.string().max(40),
      priceMin: z.number().min(0).max(1000),
      priceMax: z.number().min(0).max(1000),
      phone: z.string().max(40),
      mapsUrl: z.url({ protocol: /^https$/, hostname: /(^|\.)google\.com$/ }),
    }))
    .min(2)
    .max(8),
});
const voteBody = z.object({ name: z.string().trim().min(1).max(40), optionId: z.string().min(1).max(300) });

const today = () => new Date().toISOString().slice(0, 10);

const voteRateLimit = authRateLimit(60, 10 * 60_000);

/** Fixed-window limit on login/register per client IP (in memory; fine for one instance). */
function authRateLimit(max = 20, windowMs = 15 * 60_000): express.RequestHandler {
  const hits = new Map<string, { count: number; reset: number }>();
  return (req, _res, next) => {
    const now = Date.now();
    const key = req.ip ?? "unknown";
    const entry = hits.get(key);
    if (!entry || entry.reset <= now) {
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
      hits.set(key, { count: 1, reset: now + windowMs });
      return next();
    }
    if (++entry.count > max) return next(new HttpError(429, "Too many attempts, try again later"));
    next();
  };
}

export interface AppOptions {
  /** Group-dining candidates; defaults to Google Places when GOOGLE_PLACES_API_KEY is set, else the demo rows. */
  restaurants?: (repo: Repository) => RestaurantSource;
}

export function createApp(
  db: Db,
  authCfg: AuthConfig,
  providers: Record<GroceryProvider["id"], GroceryProvider> = groceryProviders(),
  opts: AppOptions = {},
) {
  const repo = new Repository(db);
  const placesKey = process.env.GOOGLE_PLACES_API_KEY;
  const restaurantSource = opts.restaurants?.(repo) ?? (placesKey ? googlePlaces(placesKey) : demoRestaurants(repo));
  const requireAuth = authenticate(authCfg, { required: true });
  const uid = (req: express.Request) => req.userId!;

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use((_req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
    });
    next();
  });
  app.use(express.json({ limit: "64kb" }));
  app.use("/api/auth", authRateLimit());

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

  // ---- auth -------------------------------------------------------------------
  app.post("/api/auth/register", async (req, res) => {
    const { email, password } = credentials.parse(req.body);
    const id = await repo.createUser(email, await hashPassword(password));
    if (id === null) throw new HttpError(409, "Email is already registered");
    res.status(201).json({ token: await issueToken(id, authCfg), email });
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = credentials.parse(req.body);
    const user = await repo.findUserByEmail(email);
    const ok = user ? await verifyPassword(password, user.password_hash) : false;
    if (!user || !ok) throw new HttpError(401, "Invalid email or password");
    res.json({ token: await issueToken(user.id, authCfg), email: user.email });
  });

  app.get("/api/me", requireAuth, async (req, res) => {
    const user = await repo.findUserById(uid(req));
    if (!user) throw new HttpError(401, "Account no longer exists");
    res.json({ ...user, preferences: await repo.getPreferences(user.id) });
  });

  // ---- vocabularies ---------------------------------------------------------------
  app.get("/api/meta", (_req, res) =>
    res.json({
      cuisines: CUISINES, tags: TAGS, equipment: EQUIPMENT, goals: GOALS, modes: MODES, diets: DIETS, allergens: ALLERGENS,
      religious: RELIGIOUS, other: OTHER_DIETS, themes: THEMES, restaurantCuisines: RESTAURANT_CUISINES, neighborhoods: NEIGHBORHOODS,
    }),
  );

  // ---- preferences ------------------------------------------------------------------
  app.get("/api/preferences", requireAuth, async (req, res) => res.json(await repo.getPreferences(uid(req))));
  app.put("/api/preferences", requireAuth, async (req, res) => {
    res.json(await repo.savePreferences(uid(req), preferencesBody.parse(req.body) as Preferences));
  });

  // ---- recommendations ------------------------------------------------------------------
  async function rankFor(userId: number, prefs: Preferences, b: z.infer<typeof recommendBody>, limit: number) {
    const d = b.day ?? today();
    const now = new Date(`${d}T12:00:00Z`);
    const [cands, history, cf, intake, pantry] = await Promise.all([
      repo.candidates(userId, {
        banned: bannedFlags(prefs.restrictions, now),
        equipment: prefs.equipment,
        maxMinutes: b.maxMinutes ?? prefs.maxMinutes,
        cuisine: b.cuisine,
        q: b.q,
      }),
      repo.history(userId),
      repo.itemSimilarity(userId),
      repo.dayTotals(userId, d),
      repo.pantry(userId),
    ]);
    const allowed = cands.filter((c) => !violatesCombination(prefs.restrictions, c.flags));
    const ranked = rank(allowed, {
      prefs: { ...prefs, mode: b.mode ?? prefs.mode },
      history,
      intake,
      cf,
      popularity: new Map(cands.map((c) => [c.id, c.pop])),
      hour: b.hour ?? new Date().getHours(),
      pantryEmpty: pantry.length === 0,
      limit,
      lambda: 1 - b.diversity,
    });
    return { ranked, intake };
  }

  app.post("/api/recommendations", requireAuth, async (req, res) => {
    const b = recommendBody.parse(req.body ?? {});
    const prefs = await repo.getPreferences(uid(req));
    const { ranked, intake } = await rankFor(uid(req), prefs, b, b.limit);
    res.json({
      intake,
      items: ranked.map((r) => ({ recipe: recipeDto(r.recipe), score: r.score, components: r.components, reasons: r.reasons })),
    });
  });

  app.post("/api/meal-plan", requireAuth, async (req, res) => {
    const b = recommendBody.parse(req.body ?? {});
    const prefs = await repo.getPreferences(uid(req));
    const { ranked } = await rankFor(uid(req), prefs, { ...b, hour: 7 }, 30);
    const { plan, solver } = planDayIlp(ranked, { dailyKcal: prefs.dailyKcal, proteinG: prefs.proteinG, dailyBudget: prefs.mealBudget * 3 });
    res.json({
      items: plan.map((p) => ({ slot: p.slot, recipe: recipeDto(p.pick.recipe), score: p.pick.score })),
      totalKcal: Math.round(plan.reduce((s, p) => s + p.pick.recipe.kcal, 0)),
      totalProtein: Math.round(plan.reduce((s, p) => s + p.pick.recipe.protein, 0)),
      targetKcal: prefs.dailyKcal,
      targetProtein: prefs.proteinG,
      solver,
    });
  });

  // ---- recipes ------------------------------------------------------------------------------
  app.get("/api/recipes", async (_req, res) => res.json({ items: await repo.listRecipes() }));

  const optionalAuth = authenticate(authCfg, { required: false });
  app.get("/api/recipes/:id", optionalAuth, async (req, res) => {
    const r = await repo.recipe(String(req.params.id), req.userId ?? null);
    if (!r) throw new HttpError(404, "Unknown recipe");
    res.json({
      ...recipeDto(r),
      saved: r.saved,
      source: r.source,
      quantitiesEstimated: r.quantities_estimated,
      ingredients: r.ingredients,
      takeout: { doordash: deepLinks.doordash(r.title_en), ubereats: deepLinks.ubereats(r.title_en) },
    });
  });

  // ---- feedback ------------------------------------------------------------------------------
  const ensureRecipe = async (id: string) => {
    if (!(await repo.recipeExists(id))) throw new HttpError(404, `Unknown recipe '${id}'`);
  };
  app.get("/api/saved", requireAuth, async (req, res) => res.json({ items: await repo.saved(uid(req)) }));
  app.post("/api/interactions", requireAuth, async (req, res) => {
    const { recipeId, kind } = interactionBody.parse(req.body);
    await ensureRecipe(recipeId);
    const created = await repo.addInteraction(uid(req), recipeId, kind);
    res.status(created ? 201 : 200).json({ recipeId, kind });
  });
  app.delete("/api/interactions/:recipeId/:kind", requireAuth, async (req, res) => {
    const kind = z.enum(["save", "dismiss"]).parse(req.params.kind);
    if (!(await repo.removeInteraction(uid(req), String(req.params.recipeId), kind))) throw new HttpError(404, "Nothing to remove");
    res.status(204).end();
  });

  // ---- meal log --------------------------------------------------------------------------------
  app.get("/api/meal-logs", requireAuth, async (req, res) => {
    const d = day.optional().parse(req.query.day) ?? today();
    const [items, totals, prefs] = await Promise.all([repo.mealLogs(uid(req), d), repo.dayTotals(uid(req), d), repo.getPreferences(uid(req))]);
    res.json({ day: d, items, totals, targets: { kcal: prefs.dailyKcal, protein: prefs.proteinG, sodiumMg: 2300 } });
  });
  app.get("/api/trends", requireAuth, async (req, res) => {
    const end = day.optional().parse(req.query.day) ?? today();
    const days = z.coerce.number().int().min(7).max(90).default(14).parse(req.query.days);
    const [t, prefs] = await Promise.all([repo.trends(uid(req), end, days), repo.getPreferences(uid(req))]);
    const logged = t.daily.filter((d) => d.meals > 0);
    const avg = (f: (d: (typeof logged)[number]) => number) => (logged.length ? logged.reduce((s, d) => s + f(d), 0) / logged.length : 0);
    const meals = t.daily.reduce((s, d) => s + d.meals, 0);
    res.json({
      days, end, daily: t.daily,
      targets: { kcal: prefs.dailyKcal, protein: prefs.proteinG },
      summary: {
        loggedDays: logged.length,
        avgKcal: Math.round(avg((d) => d.kcal)),
        avgProtein: Math.round(avg((d) => d.protein)),
        daysOnTarget: logged.filter((d) => Math.abs(d.kcal - prefs.dailyKcal) <= prefs.dailyKcal * 0.1).length,
        takeoutShare: meals ? t.daily.reduce((s, d) => s + d.takeout, 0) / meals : 0,
        groceryUsd: t.money.grocery_usd, groceryOrders: t.money.grocery_orders, takeoutOrders: t.money.takeout_orders,
        wasteItems: t.waste.items, wasteUsd: t.waste.usd,
      },
    });
  });
  app.post("/api/meal-logs", requireAuth, async (req, res) => {
    const b = mealLogBody.parse(req.body);
    const d = b.day ?? today();
    if ("recipeId" in b) {
      await ensureRecipe(b.recipeId);
      res.status(201).json({ id: await repo.logRecipe(uid(req), b.recipeId, b.servings, d) });
    } else {
      res.status(201).json({ id: await repo.logManual(uid(req), b, d) });
    }
  });
  app.delete("/api/meal-logs/:id", requireAuth, async (req, res) => {
    if (!(await repo.deleteMealLog(uid(req), Number(req.params.id)))) throw new HttpError(404, "No such entry");
    res.status(204).end();
  });

  // ---- pantry ---------------------------------------------------------------------------------
  app.get("/api/pantry", requireAuth, async (req, res) => res.json({ items: await repo.pantry(uid(req)) }));
  app.post("/api/pantry", requireAuth, async (req, res) => {
    const { foodId, grams } = pantryBody.parse(req.body);
    const id = await repo.addPantry(uid(req), foodId, grams);
    if (id === null) throw new HttpError(404, `Unknown food '${foodId}'`);
    res.status(201).json({ id });
  });
  app.delete("/api/pantry/:id", requireAuth, async (req, res) => {
    if (!(await repo.deletePantry(uid(req), Number(req.params.id)))) throw new HttpError(404, "No such item");
    res.status(204).end();
  });
  app.get("/api/foods", async (req, res) => {
    const q = z.string().min(1).max(60).parse(req.query.q);
    res.json({ items: await repo.searchFoods(q) });
  });

  // ---- shopping & hand-offs ------------------------------------------------------------------
  app.post("/api/shopping-list", requireAuth, async (req, res) => {
    const { recipeIds } = recipeIdsBody.parse(req.body);
    const items = await repo.shoppingList(uid(req), recipeIds);
    res.json({ items, estTotal: Math.round(items.reduce((s, i) => s + i.est_usd, 0) * 100) / 100 });
  });

  app.post("/api/checkout", requireAuth, async (req, res) => {
    const { recipeIds, provider } = checkoutBody.parse(req.body);
    const items = await repo.shoppingList(uid(req), recipeIds);
    if (!items.length) throw new HttpError(409, "Everything is already in your pantry");
    const link = await providers[provider].buildShoppingLink(
      "PlateWise shopping list",
      items.map((i) => ({ foodId: i.food_id, name: i.name_en, grams: i.grams })),
    );
    const estTotal = Math.round(items.reduce((s, i) => s + i.est_usd, 0) * 100) / 100;
    const intentId = await repo.createIntent(uid(req), "grocery", provider, link.url, {
      label: `${items.length} items`, estTotal, recipeIds, items: items.map((i) => ({ foodId: i.food_id, grams: i.grams })),
    });
    res.status(201).json({ ...link, intentId, estTotal });
  });

  app.post("/api/takeout", requireAuth, async (req, res) => {
    const { provider, query } = takeoutBody.parse(req.body);
    const url = deepLinks[provider](query);
    const intentId = await repo.createIntent(uid(req), "takeout", provider, url, { label: query });
    res.status(201).json({ url, intentId });
  });

  app.get("/api/intents/pending", requireAuth, async (req, res) => res.json({ items: await repo.pendingIntents(uid(req)) }));
  app.post("/api/intents/:id", requireAuth, async (req, res) => {
    const { confirmed } = intentBody.parse(req.body);
    const out = await repo.resolveIntent(uid(req), Number(req.params.id), confirmed);
    if (!out) throw new HttpError(404, "No pending hand-off with that id");
    res.json(out);
  });

  // ---- group dining ----------------------------------------------------------------------------
  const mapsUrlFor = (r: { name: string; maps_url?: string }) => r.maps_url ?? deepLinks.googleMaps(`${r.name} Boston MA`);

  app.post("/api/group/recommendations", requireAuth, async (req, res) => {
    const q = groupBody.parse(req.body);
    const center = {
      lat: q.participants.reduce((s, p) => s + p.origin.lat, 0) / q.participants.length,
      lng: q.participants.reduce((s, p) => s + p.origin.lng, 0) / q.participants.length,
    };
    // Radius that the travel limit allows (20 km/h city speed, as in travelMinutes).
    const radiusM = Math.round((q.maxTravelMinutes / 60) * 20_000);
    const [rows, visits] = await Promise.all([
      restaurantSource.search({ cuisine: q.cuisine, center, radiusM }),
      repo.restaurantVisits(uid(req)),
    ]);
    const results = recommendGroup(rows, q, visits);
    res.json({
      source: restaurantSource.id,
      items: results.map((r) => ({ ...r, mapsUrl: mapsUrlFor(r.restaurant) })),
    });
  });
  app.post("/api/group/visit", requireAuth, async (req, res) => {
    const { restaurantId, name, mapsUrl } = restaurantVisitBody.parse(req.body);
    const url = mapsUrl ?? deepLinks.googleMaps(`${name} Boston MA`);
    const intentId = await repo.createIntent(uid(req), "restaurant", "google-maps", url, { label: name, restaurantId });
    res.status(201).json({ url, intentId });
  });

  // ---- shareable group vote: friends open a link and pick one, no account needed --------
  app.post("/api/group/polls", requireAuth, async (req, res) => {
    const b = pollBody.parse(req.body);
    const token = randomBytes(12).toString("base64url");
    await repo.createPoll(uid(req), token, b.title, b.options);
    res.status(201).json({ token, path: `/poll/${token}` });
  });
  app.get("/api/polls/:token", async (req, res) => {
    const p = await repo.poll(String(req.params.token));
    if (!p) throw new HttpError(404, "This vote has ended or does not exist");
    const counts = new Map<string, string[]>();
    for (const v of p.votes) counts.set(v.option_id, [...(counts.get(v.option_id) ?? []), v.voter]);
    res.json({
      title: p.title,
      expiresAt: p.expires_at,
      options: p.options.map((o) => ({ ...o, voters: counts.get(o.id) ?? [] })),
    });
  });
  app.post("/api/polls/:token/vote", voteRateLimit, async (req, res) => {
    const { name, optionId } = voteBody.parse(req.body);
    const r = await repo.vote(String(req.params.token), name.trim(), optionId);
    if (r === "missing") throw new HttpError(404, "This vote has ended or does not exist");
    if (r === "bad-option") throw new HttpError(400, "Unknown option");
    res.status(204).end();
  });

  app.use("/api", (_req, _res, next) => next(new HttpError(404, "Not found")));
  app.use(errorHandler);
  return app;
}

function recipeDto(r: {
  id: string; title_en: string; title_zh: string; emoji: string; cuisine: string; tags: string[]; minutes: number; servings: number;
  kcal: number; protein: number; carbs: number; fat: number; sugar: number; sodium_mg: number; cost_per_serving: number; flags: string[];
  steps?: number; equipment?: string[]; have?: number; n_ingredients?: number; missing_cost?: number; expiring?: number;
}) {
  return {
    id: r.id, title: { en: r.title_en, zh: r.title_zh }, emoji: r.emoji, cuisine: r.cuisine, tags: r.tags, minutes: r.minutes,
    steps: r.steps, servings: r.servings, equipment: r.equipment,
    nutrition: { kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, sugar: r.sugar, sodiumMg: r.sodium_mg },
    costPerServing: r.cost_per_serving, flags: r.flags,
    pantry: r.have === undefined ? undefined : { have: r.have, total: r.n_ingredients, expiring: r.expiring, missingCost: r.missing_cost },
  };
}
