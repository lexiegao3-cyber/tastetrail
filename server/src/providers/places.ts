import type { Repository, RestaurantRow } from "../repository.js";

/**
 * Where group-dining candidates come from. The demo source reads the seeded
 * fictional restaurants; the Google source calls Places API (New) Text Search
 * live. Google's terms allow storing only place IDs, so Places results are never
 * written to the database: visits keep the place ID, nothing else.
 */
export interface RestaurantSource {
  id: "demo" | "google-places";
  search(q: { cuisine?: string; center: { lat: number; lng: number }; radiusM: number }): Promise<RestaurantRow[]>;
}

export const demoRestaurants = (repo: Repository): RestaurantSource => ({ id: "demo", search: () => repo.restaurants() });

const CUISINE_QUERY: Record<string, string> = {
  hotpot: "hot pot", "korean-bbq": "korean bbq", "american-bbq": "bbq",
};

const TYPE_CUISINE: [RegExp, string][] = [
  [/korean/, "korean-bbq"], [/japanese|sushi|ramen/, "japanese"], [/chinese/, "chinese"], [/thai/, "thai"],
  [/vietnamese/, "vietnamese"], [/indian/, "indian"], [/mexican/, "mexican"], [/italian|pizza/, "italian"],
  [/mediterranean|greek|middle_eastern|lebanese|turkish/, "mediterranean"], [/barbecue/, "american-bbq"], [/american|hamburger/, "american"],
];

const PRICE_LEVEL: Record<string, [number, number]> = {
  PRICE_LEVEL_FREE: [0, 0], PRICE_LEVEL_INEXPENSIVE: [8, 15], PRICE_LEVEL_MODERATE: [15, 30],
  PRICE_LEVEL_EXPENSIVE: [30, 60], PRICE_LEVEL_VERY_EXPENSIVE: [60, 120],
};

interface Money { units?: string | number; nanos?: number }
interface Point { day: number; hour: number; minute?: number }
export interface PlacesPlace {
  id: string;
  displayName?: { text: string };
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  priceRange?: { startPrice?: Money; endPrice?: Money };
  nationalPhoneNumber?: string;
  googleMapsUri?: string;
  primaryType?: string;
  regularOpeningHours?: { periods?: { open: Point; close?: Point }[] };
  servesVegetarianFood?: boolean;
  goodForGroups?: boolean;
  reservable?: boolean;
}

const money = (m?: Money) => (m?.units === undefined ? undefined : Number(m.units) + (m.nanos ?? 0) / 1e9);

/** Opening hours for one weekday (0 = Sunday, as in Places); unknown hours count as open all day. */
function hoursOn(p: PlacesPlace, weekday: number): [number, number] {
  const periods = p.regularOpeningHours?.periods;
  if (!periods?.length) return [0, 24];
  const today = periods.filter((x) => x.open.day === weekday);
  if (!today.length) return [0, 0];
  const open = Math.min(...today.map((x) => x.open.hour + (x.open.minute ?? 0) / 60));
  const close = Math.max(...today.map((x) => (x.close ? (x.close.day !== weekday ? 24 + x.close.hour : x.close.hour) + (x.close.minute ?? 0) / 60 : 24)));
  return [open, close];
}

export function placeToRestaurant(p: PlacesPlace, searchedCuisine: string | undefined, weekday: number): RestaurantRow | null {
  if (!p.location || !p.displayName) return null;
  const [lo, hi] = [money(p.priceRange?.startPrice), money(p.priceRange?.endPrice)];
  const level = PRICE_LEVEL[p.priceLevel ?? ""] ?? [15, 40];
  const [open, close] = hoursOn(p, weekday);
  return {
    id: `gp:${p.id}`,
    name: p.displayName.text,
    cuisine: searchedCuisine ?? TYPE_CUISINE.find(([re]) => re.test(p.primaryType ?? ""))?.[1] ?? "american",
    lat: p.location.latitude,
    lng: p.location.longitude,
    price_min: lo ?? level[0],
    price_max: hi ?? lo ?? level[1],
    rating: p.rating ?? 0,
    review_count: p.userRatingCount ?? 0,
    phone: p.nationalPhoneNumber ?? "",
    open_hour: open,
    close_hour: close,
    attrs: { vegetarian: !!p.servesVegetarianFood, largeTables: !!p.goodForGroups, reservable: !!p.reservable },
    maps_url: p.googleMapsUri,
  };
}

const FIELDS = [
  "places.id", "places.displayName", "places.location", "places.rating", "places.userRatingCount", "places.priceLevel",
  "places.priceRange", "places.nationalPhoneNumber", "places.googleMapsUri", "places.primaryType", "places.regularOpeningHours",
  "places.servesVegetarianFood", "places.goodForGroups", "places.reservable",
].join(",");

export function googlePlaces(apiKey: string, fetchImpl: typeof fetch = fetch): RestaurantSource {
  return {
    id: "google-places",
    async search(q) {
      const res = await fetchImpl("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELDS },
        body: JSON.stringify({
          textQuery: `${q.cuisine ? (CUISINE_QUERY[q.cuisine] ?? q.cuisine) + " " : ""}restaurant`,
          includedType: "restaurant",
          locationBias: { circle: { center: { latitude: q.center.lat, longitude: q.center.lng }, radius: Math.min(50_000, q.radiusM) } },
          pageSize: 20,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`Places search failed: ${res.status}`);
      const body = (await res.json()) as { places?: PlacesPlace[] };
      const weekday = new Date().getDay();
      return (body.places ?? []).map((p) => placeToRestaurant(p, q.cuisine, weekday)).filter((r): r is RestaurantRow => r !== null);
    },
  };
}
