import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDatabase, type Db } from "../src/db/index.js";
import type { GroceryProvider } from "../src/providers/index.js";

let db: Db;
let app: ReturnType<typeof createApp>;
const auth = { secret: new TextEncoder().encode("test-secret-0123456789-0123456789"), ttlSeconds: 600 };
const mockProvider = (id: GroceryProvider["id"]): GroceryProvider => ({ id, buildShoppingLink: async () => ({ url: `https://example.test/${id}`, mode: "mock" }) });

beforeAll(async () => {
  db = await openDatabase();
  app = createApp(db, auth, { instacart: mockProvider("instacart"), kroger: mockProvider("kroger") });
}, 60_000);
afterAll(() => db.close());

async function signup(email: string) {
  const res = await request(app).post("/api/auth/register").send({ email, password: "correct-horse" });
  expect(res.status).toBe(201);
  return { Authorization: `Bearer ${res.body.token}` };
}

const prefs = {
  goal: "maintain", mode: "everyday", dailyKcal: 2000, proteinG: 90, cuisines: ["thai"],
  restrictions: { diet: "none", allergens: [], religious: [], other: [] },
  equipment: ["stove", "microwave"], maxMinutes: 30, mealBudget: 10, zip: "02115", area: "back-bay",
};

describe("PlateWise API", () => {
  it("builds per-serving nutrition in the materialized view", async () => {
    const res = await request(app).get("/api/recipes/tomato-egg");
    expect(res.status).toBe(200);
    expect(res.body.nutrition.kcal).toBeGreaterThan(300);
    expect(res.body.flags).toEqual(expect.arrayContaining(["egg", "a:egg", "allium"]));
    expect(res.body.takeout.ubereats).toContain("ubereats.com");
  });

  it("validates auth and preferences", async () => {
    expect((await request(app).post("/api/recommendations").send({})).status).toBe(401);
    const h = await signup("val@example.com");
    const bad = await request(app).put("/api/preferences").set(h).send({ ...prefs, zip: "12" });
    expect(bad.status).toBe(400);
    expect(bad.body.issues[0].path).toBe("zip");
    expect((await request(app).put("/api/preferences").set(h).send(prefs)).status).toBe(200);
  });

  it("never recommends what a restriction rules out", async () => {
    const h = await signup("veg@example.com");
    await request(app).put("/api/preferences").set(h).send({
      ...prefs, restrictions: { diet: "vegan", allergens: ["peanut", "sesame"], religious: [], other: [] },
    });
    const res = await request(app).post("/api/recommendations").set(h).send({ limit: 30, hour: 12 });
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const it of res.body.items) {
      expect(it.recipe.flags).not.toEqual(expect.arrayContaining(["egg"]));
      for (const f of ["meat", "poultry", "fish", "dairy", "egg", "honey", "a:peanut", "a:sesame"]) expect(it.recipe.flags).not.toContain(f);
    }
  });

  it("pantry stock lifts recipes that use it and cooking consumes it", async () => {
    const h = await signup("pantry@example.com");
    await request(app).put("/api/preferences").set(h).send({ ...prefs, cuisines: [] });
    for (const [foodId, grams] of [["tomato", 300], ["egg", 200], ["scallion", 20]] as const) {
      expect((await request(app).post("/api/pantry").set(h).send({ foodId, grams })).status).toBe(201);
    }
    const res = await request(app).post("/api/recommendations").set(h).send({ limit: 5, hour: 12 });
    type Item = { recipe: { id: string }; components: { convenience: number }; reasons: { code: string }[] };
    const items: Item[] = res.body.items;
    const tomato = items.find((i) => i.recipe.id === "tomato-egg")!;
    expect(items.slice(0, 3)).toContain(tomato);
    expect(tomato.components.convenience).toBe(Math.max(...items.map((i) => i.components.convenience)));
    expect(tomato.reasons.map((r) => r.code)).toContain("convenience.pantry");

    expect((await request(app).post("/api/meal-logs").set(h).send({ recipeId: "tomato-egg", servings: 2 })).status).toBe(201);
    const pantry = await request(app).get("/api/pantry").set(h);
    expect(pantry.body.items.find((p: { food_id: string }) => p.food_id === "tomato")).toBeUndefined();
    const log = await request(app).get("/api/meal-logs").set(h);
    expect(log.body.totals.meals).toBe(1);
    expect(log.body.totals.kcal).toBeGreaterThan(500);
  });

  it("checkout creates a pending hand-off that confirms into the pantry", async () => {
    const h = await signup("shop@example.com");
    const list = await request(app).post("/api/shopping-list").set(h).send({ recipeIds: ["burrito-bowl"] });
    expect(list.body.items.length).toBe(8);
    const co = await request(app).post("/api/checkout").set(h).send({ recipeIds: ["burrito-bowl"], provider: "instacart" });
    expect(co.status).toBe(201);
    expect(co.body.url).toBe("https://example.test/instacart");
    const pending = await request(app).get("/api/intents/pending").set(h);
    expect(pending.body.items).toHaveLength(1);
    expect((await request(app).post(`/api/intents/${co.body.intentId}`).set(h).send({ confirmed: true })).body.status).toBe("confirmed");
    expect((await request(app).post(`/api/intents/${co.body.intentId}`).set(h).send({ confirmed: true })).status).toBe(404);
    const after = await request(app).post("/api/shopping-list").set(h).send({ recipeIds: ["burrito-bowl"] });
    expect(after.body.items).toHaveLength(0);
  });

  it("isolates users: nobody can touch another user's data", async () => {
    const a = await signup("a@example.com");
    const b = await signup("b@example.com");
    const { body } = await request(app).post("/api/pantry").set(a).send({ foodId: "rice", grams: 500 });
    expect((await request(app).delete(`/api/pantry/${body.id}`).set(b)).status).toBe(404);
    expect((await request(app).get("/api/pantry").set(b)).body.items).toHaveLength(0);
    const co = await request(app).post("/api/checkout").set(a).send({ recipeIds: ["overnight-oats"], provider: "kroger" });
    expect((await request(app).post(`/api/intents/${co.body.intentId}`).set(b).send({ confirmed: true })).status).toBe(404);
  });

  it("item-item CF recommends what similar users liked", async () => {
    for (let i = 0; i < 3; i++) {
      const h = await signup(`cf${i}@example.com`);
      for (const recipeId of ["red-lentil-dal", "chickpea-curry"]) await request(app).post("/api/interactions").set(h).send({ recipeId, kind: "save" });
    }
    const me = await signup("cf-me@example.com");
    await request(app).put("/api/preferences").set(me).send({ ...prefs, cuisines: [] });
    await request(app).post("/api/interactions").set(me).send({ recipeId: "red-lentil-dal", kind: "save" });
    const res = await request(app).post("/api/recommendations").set(me).send({ limit: 30, hour: 12 });
    const curry = res.body.items.find((i: { recipe: { id: string } }) => i.recipe.id === "chickpea-curry");
    expect(curry.components.collaborative).toBeGreaterThan(0.5);
    expect(curry.reasons.map((r: { code: string }) => r.code)).toContain("cf.alsoLiked");
  });

  it("plans a day and recommends a fair group restaurant", async () => {
    const h = await signup("plan@example.com");
    const plan = await request(app).post("/api/meal-plan").set(h).send({});
    expect(plan.status).toBe(200);
    expect(plan.body.items.map((i: { slot: string }) => i.slot)).toEqual(["breakfast", "lunch", "dinner"]);

    const group = await request(app).post("/api/group/recommendations").set(h).send({
      partySize: 8, theme: "birthday", cuisine: "hotpot", budget: [25, 45], hour: 19, maxTravelMinutes: 45,
      participants: [
        { name: "Me", origin: { lat: 42.3503, lng: -71.081 } },
        { name: "Sam", origin: { lat: 42.3651, lng: -71.1037 }, restrictions: { diet: "lacto-ovo", allergens: [], religious: [], other: [] } },
      ],
    });
    expect(group.status).toBe(200);
    expect(group.body.items.length).toBeGreaterThan(0);
    expect(group.body.items.every((i: { restaurant: { cuisine: string } }) => i.restaurant.cuisine === "hotpot")).toBe(true);
    expect(group.body.items[0].mapsUrl).toContain("google.com/maps/search");
  });

  it("matches foods by trigram similarity", async () => {
    const res = await request(app).get("/api/foods").query({ q: "chiken brest" });
    expect(res.body.items[0].id).toBe("chicken_breast");
  });
});
