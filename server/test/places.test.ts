import { describe, expect, it } from "vitest";
import { googlePlaces, placeToRestaurant, type PlacesPlace } from "../src/providers/places.js";

const place: PlacesPlace = {
  id: "ChIJabc",
  displayName: { text: "Little Sheep Hot Pot" },
  location: { latitude: 42.35, longitude: -71.06 },
  rating: 4.4,
  userRatingCount: 812,
  priceRange: { startPrice: { units: "20" }, endPrice: { units: "40" } },
  nationalPhoneNumber: "(617) 555-0199",
  googleMapsUri: "https://maps.google.com/?cid=123",
  primaryType: "chinese_restaurant",
  regularOpeningHours: { periods: [{ open: { day: 5, hour: 11, minute: 30 }, close: { day: 5, hour: 22 } }, { open: { day: 6, hour: 11 }, close: { day: 0, hour: 1 } }] },
  servesVegetarianFood: true,
  goodForGroups: true,
};

describe("Google Places adapter", () => {
  it("maps a Places (New) result to a restaurant row", () => {
    const r = placeToRestaurant(place, "hotpot", 5)!;
    expect(r).toMatchObject({
      id: "gp:ChIJabc", name: "Little Sheep Hot Pot", cuisine: "hotpot", price_min: 20, price_max: 40, rating: 4.4,
      review_count: 812, open_hour: 11.5, close_hour: 22, maps_url: "https://maps.google.com/?cid=123",
      attrs: { vegetarian: true, largeTables: true, reservable: false },
    });
    expect(placeToRestaurant(place, undefined, 6)!).toMatchObject({ cuisine: "chinese", open_hour: 11, close_hour: 25 });
    expect(placeToRestaurant(place, undefined, 2)!).toMatchObject({ open_hour: 0, close_hour: 0 }); // closed that day
    expect(placeToRestaurant({ ...place, priceRange: undefined, priceLevel: "PRICE_LEVEL_MODERATE" }, undefined, 5)).toMatchObject({ price_min: 15, price_max: 30 });
  });

  it("sends the key, field mask and location bias", async () => {
    let sent: { url: string; init: RequestInit } | undefined;
    const fake = (async (url: string, init: RequestInit) => {
      sent = { url, init };
      return new Response(JSON.stringify({ places: [place] }), { status: 200 });
    }) as unknown as typeof fetch;
    const rows = await googlePlaces("KEY", fake).search({ cuisine: "korean-bbq", center: { lat: 42.3, lng: -71 }, radiusM: 80_000 });
    expect(rows).toHaveLength(1);
    const h = sent!.init.headers as Record<string, string>;
    expect(sent!.url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(h["X-Goog-Api-Key"]).toBe("KEY");
    expect(h["X-Goog-FieldMask"]).toContain("places.nationalPhoneNumber");
    const body = JSON.parse(String(sent!.init.body));
    expect(body.textQuery).toBe("korean bbq restaurant");
    expect(body.locationBias.circle.radius).toBe(50_000);
  });
});
