import request from "supertest";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDatabase, type Db } from "../src/db/index.js";
import { placeToRestaurant } from "../src/providers/places.js";

let db: Db;
beforeAll(async () => (db = await openDatabase()), 60_000);
afterAll(() => db.close());

it("group dining can rank live Places results and record a visit by place ID", async () => {
  const live = placeToRestaurant({
    id: "ChIJlive", displayName: { text: "Live Hot Pot" }, location: { latitude: 42.35, longitude: -71.07 }, rating: 4.6, userRatingCount: 300,
    priceLevel: "PRICE_LEVEL_MODERATE", googleMapsUri: "https://maps.google.com/?cid=9", nationalPhoneNumber: "(617) 555-0142", goodForGroups: true,
  }, "hotpot", 5)!;
  const app = createApp(db, { secret: new TextEncoder().encode("test-secret-0123456789-0123456789"), ttlSeconds: 600 }, undefined, {
    restaurants: () => ({ id: "google-places", search: async () => [live] }),
  });
  const reg = await request(app).post("/api/auth/register").send({ email: "places@example.com", password: "correct-horse" });
  const h = { Authorization: `Bearer ${reg.body.token}` };
  const res = await request(app).post("/api/group/recommendations").set(h).send({
    partySize: 4, theme: "friends", cuisine: "hotpot", budget: [15, 40], maxTravelMinutes: 30, hour: 19,
    participants: [{ name: "A", origin: { lat: 42.35, lng: -71.06 } }, { name: "B", origin: { lat: 42.36, lng: -71.08 } }],
  }).expect(200);
  expect(res.body.source).toBe("google-places");
  expect(res.body.items[0].restaurant.id).toBe("gp:ChIJlive");
  expect(res.body.items[0].mapsUrl).toBe("https://maps.google.com/?cid=9");
  const visit = await request(app).post("/api/group/visit").set(h)
    .send({ restaurantId: "gp:ChIJlive", name: "Live Hot Pot", mapsUrl: "https://maps.google.com/?cid=9" }).expect(201);
  await request(app).post(`/api/intents/${visit.body.intentId}`).set(h).send({ confirmed: true }).expect(200);
  const [row] = await db.query<{ restaurant_id: string }>("SELECT restaurant_id FROM restaurant_visits");
  expect(row!.restaurant_id).toBe("gp:ChIJlive");
});
