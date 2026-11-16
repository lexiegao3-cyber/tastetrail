import type { RestaurantRow } from "../repository.js";
import type { Theme } from "../vocab.js";
import { unionRestrictions, type Restrictions } from "./restrictions.js";

/**
 * Group dining. Six factors from the restaurant- and group-recommendation
 * literature; group taste uses Masthoff's "average without misery": a place
 * that any participant would hate is removed, the rest are ranked by the mean.
 */
export const GROUP_WEIGHTS = {
  taste: 0.25,
  fairness: 0.2,
  price: 0.15,
  occasion: 0.15,
  reputation: 0.15,
  history: 0.1,
} as const;
export type GroupFactor = keyof typeof GROUP_WEIGHTS;

export interface Participant {
  name: string;
  origin: { lat: number; lng: number };
  likes: string[];
  avoids: string[];
  restrictions: Restrictions;
}

export interface GroupQuery {
  participants: Participant[];
  partySize: number;
  theme: Theme;
  cuisine?: string;
  budget: [number, number];
  maxTravelMinutes: number;
  hour: number;
  limit: number;
}

export interface GroupResult {
  restaurant: RestaurantRow;
  score: number;
  components: Record<GroupFactor, number>;
  travel: { name: string; minutes: number }[];
  reasons: { code: string; params?: Record<string, string | number>; weight: number }[];
  warnings: string[];
}

const THEME_ATTRS: Record<Theme, string[]> = {
  friends: ["largeTables", "bar"],
  birthday: ["largeTables", "reservable"],
  date: ["quiet", "bar"],
  team: ["largeTables", "reservable"],
  business: ["quiet", "reservable"],
  family: ["kidsMenu", "largeTables"],
};

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Rough city travel time: road distance ≈ 1.3 × straight line at ~20 km/h door to door. */
export const travelMinutes = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  Math.round(((haversineKm(a, b) * 1.3) / 20) * 60 + 5);

export function isOpen(r: Pick<RestaurantRow, "open_hour" | "close_hour">, hour: number) {
  const h = hour < r.open_hour && r.close_hour > 24 ? hour + 24 : hour;
  return h >= r.open_hour && h < r.close_hour - 0.5;
}

export function recommendGroup(rows: RestaurantRow[], q: GroupQuery, visits: Map<string, number>): GroupResult[] {
  const all = unionRestrictions(q.participants.map((p) => p.restrictions));
  const needsVeg = all.diet !== "none" && all.diet !== "flexitarian" && all.diet !== "pescatarian";
  const out: GroupResult[] = [];
  const useHistory = visits.size > 0;
  const active = (Object.keys(GROUP_WEIGHTS) as GroupFactor[]).filter((f) => f !== "history" || useHistory);
  const totalW = active.reduce((s, f) => s + GROUP_WEIGHTS[f], 0);
  const wanted = [...THEME_ATTRS[q.theme], ...(q.partySize >= 6 ? ["largeTables"] : [])];
  const uniqWanted = [...new Set(wanted)];

  for (const r of rows) {
    // ---- hard filters ----
    if (!isOpen(r, q.hour)) continue;
    if (q.cuisine && r.cuisine !== q.cuisine) continue;
    if (needsVeg && !r.attrs.vegetarian) continue;
    if (all.religious.includes("halal") && !r.attrs.halal && !r.attrs.vegetarian) continue;
    if (all.religious.includes("kosher") && !r.attrs.kosher) continue;
    if (r.price_min > q.budget[1] || r.price_max < q.budget[0]) continue;
    const travel = q.participants.map((p) => ({ name: p.name, minutes: travelMinutes(p.origin, r) }));
    const worst = Math.max(...travel.map((t) => t.minutes));
    if (worst > q.maxTravelMinutes) continue;

    // ---- taste: average without misery ----
    const perPerson: number[] = q.participants.map((p): number => (p.avoids.includes(r.cuisine) ? 0 : p.likes.includes(r.cuisine) ? 1 : p.likes.length ? 0.4 : 0.6));
    if (perPerson.some((s) => s === 0)) continue;
    const taste = q.cuisine ? 1 : perPerson.reduce((a, b) => a + b, 0) / perPerson.length;

    const fairness = clamp(1 - worst / q.maxTravelMinutes);
    const overlap = Math.min(r.price_max, q.budget[1]) - Math.max(r.price_min, q.budget[0]);
    const price = clamp(overlap / Math.max(1, Math.min(r.price_max - r.price_min, q.budget[1] - q.budget[0])));
    const occasion = uniqWanted.length ? uniqWanted.filter((a) => r.attrs[a]).length / uniqWanted.length : 0.5;
    const bayes = (r.rating * r.review_count + 4.2 * 50) / (r.review_count + 50);
    const reputation = clamp((bayes - 3.5) / 1.5);
    const history = visits.has(r.id) ? 1 : 0.4;

    const components = { taste, fairness, price, occasion, reputation, history } as Record<GroupFactor, number>;
    let score = 0;
    for (const f of active) score += (GROUP_WEIGHTS[f] / totalW) * components[f];

    const w = (f: GroupFactor) => r3((GROUP_WEIGHTS[f] / totalW) * components[f]);
    type R = GroupResult["reasons"][number];
    const reasons: R[] = [
      { code: q.cuisine ? "group.cuisine" : "group.taste", params: { cuisine: r.cuisine, liked: perPerson.filter((s) => s === 1).length, total: perPerson.length }, weight: w("taste") },
      { code: "group.fairness", params: { worst }, weight: w("fairness") },
      { code: "group.price", params: { min: r.price_min, max: r.price_max }, weight: w("price") },
      { code: "group.occasion", params: { theme: q.theme, matched: uniqWanted.filter((a) => r.attrs[a]).join(",") }, weight: w("occasion") },
      { code: "group.reputation", params: { rating: r.rating, reviews: r.review_count }, weight: w("reputation") },
      ...(useHistory && visits.has(r.id) ? [{ code: "group.visited", weight: w("history") } as R] : []),
    ];
    reasons.sort((a, b) => b.weight - a.weight);

    const warnings: string[] = [];
    if (all.allergens.length) warnings.push("group.allergenCheck");
    if (q.partySize >= 8 && !r.attrs.reservable) warnings.push("group.callAhead");
    for (const f of Object.keys(components) as GroupFactor[]) components[f] = r3(components[f]);
    out.push({ restaurant: r, score: r3(score), components, travel, reasons, warnings });
  }
  out.sort((a, b) => b.score - a.score || a.restaurant.id.localeCompare(b.restaurant.id));
  return out.slice(0, q.limit);
}
