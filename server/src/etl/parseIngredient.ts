/**
 * Turns a free-text ingredient line ("1 1/2 cups chopped onion") into a quantity
 * in grams plus a clean food name for matching. Volume units use a per-food
 * density when known (flour is lighter than water); counts use typical unit weights.
 */

export interface ParsedIngredient {
  raw: string;
  quantity: number | null;
  unit: string | null;
  name: string;
  grams: number | null;
}

const UNIT_ALIASES: Record<string, string> = {
  g: "g", gram: "g", grams: "g",
  kg: "kg", kilogram: "kg", kilograms: "kg",
  oz: "oz", ounce: "oz", ounces: "oz",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  ml: "ml", milliliter: "ml", milliliters: "ml",
  l: "l", liter: "l", liters: "l",
  c: "cup", cup: "cup", cups: "cup",
  tbsp: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp", tbs: "tbsp", tbl: "tbsp", t: "tbsp",
  tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp",
  pinch: "pinch", dash: "pinch",
  clove: "clove", cloves: "clove",
  slice: "slice", slices: "slice",
  can: "can", cans: "can",
  pkg: "pkg", package: "pkg", packages: "pkg",
  stalk: "stalk", stalks: "stalk",
  bunch: "bunch",
};

const MASS_G: Record<string, number> = { g: 1, kg: 1000, oz: 28.35, lb: 453.6 };
const VOLUME_ML: Record<string, number> = { ml: 1, l: 1000, cup: 240, tbsp: 15, tsp: 5 };

/** g per ml for common ingredients; water-like (1.0) otherwise. */
const DENSITY: [RegExp, number][] = [
  [/flour/, 0.53],
  [/oat/, 0.38],
  [/sugar/, 0.85],
  [/rice/, 0.78],
  [/oil|butter/, 0.92],
  [/honey|syrup/, 1.42],
  [/cheese|parmesan|cheddar/, 0.42],
  [/spinach|lettuce|basil|cilantro|cabbage/, 0.13],
  [/onion|pepper|carrot|broccoli|mushroom|tomato|cucumber|zucchini/, 0.6],
  [/bean|chickpea|lentil/, 0.75],
];

/** Typical weight of one item / clove / slice etc. */
const EACH_G: [RegExp, number][] = [
  [/egg/, 50],
  [/garlic/, 3],
  [/onion/, 110],
  [/tomato/, 123],
  [/potato/, 213],
  [/carrot/, 61],
  [/bell pepper|pepper/, 119],
  [/avocado/, 150],
  [/banana/, 118],
  [/lemon|lime/, 58],
  [/tortilla/, 45],
  [/bread/, 30],
  [/scallion|green onion/, 15],
  [/chicken breast/, 175],
];

const STOP = new Set([
  "chopped", "diced", "minced", "sliced", "fresh", "large", "small", "medium", "finely", "thinly", "roughly",
  "cooked", "uncooked", "boneless", "skinless", "packed", "firmly", "lightly", "softened", "melted", "grated",
  "shredded", "crushed", "ground", "to", "taste", "of", "and", "or", "optional", "divided", "about", "plus",
  "more", "for", "serving", "peeled", "drained", "rinsed", "beaten", "whole", "cut", "into", "pieces", "inch",
]);

const UNICODE_FRAC: Record<string, number> = { "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75, "⅛": 0.125 };

function parseQuantity(tokens: string[]): { qty: number | null; used: number } {
  let qty = 0;
  let used = 0;
  for (const tok of tokens) {
    const t = tok.replace(/,$/, "");
    let v: number | null = null;
    if (/^\d+(\.\d+)?$/.test(t)) v = Number(t);
    else if (/^\d+\/\d+$/.test(t)) {
      const [a, b] = t.split("/").map(Number);
      v = b ? a! / b : null;
    } else if (/^\d+-\d+$/.test(t)) {
      const [a, b] = t.split("-").map(Number);
      v = (a! + b!) / 2;
    } else if (t in UNICODE_FRAC) v = UNICODE_FRAC[t]!;
    else if (/^\d+[½⅓⅔¼¾⅛]$/.test(t)) v = Number(t.slice(0, -1)) + UNICODE_FRAC[t.slice(-1)]!;
    if (v === null) break;
    qty += v;
    used++;
  }
  return { qty: used ? qty : null, used };
}

export function parseIngredient(raw: string): ParsedIngredient {
  const cleaned = raw
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9½⅓⅔¼¾⅛/.\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = cleaned.split(" ").filter(Boolean);
  const { qty, used } = parseQuantity(tokens);
  let rest = tokens.slice(used);
  let unit: string | null = null;
  const u = rest[0]?.replace(/\.$/, "");
  if (u && UNIT_ALIASES[u]) {
    unit = UNIT_ALIASES[u]!;
    rest = rest.slice(1);
  }
  const name = rest
    .map((t) => t.replace(/\.$/, ""))
    .filter((t) => t && !STOP.has(t) && !/^\d/.test(t))
    .join(" ");
  return { raw, quantity: qty, unit, name, grams: toGrams(qty, unit, name) };
}

export function toGrams(qty: number | null, unit: string | null, name: string): number | null {
  if (unit === "pinch") return 0.5;
  if (qty === null) return null;
  if (unit && MASS_G[unit]) return round(qty * MASS_G[unit]!);
  if (unit && VOLUME_ML[unit]) {
    const density = DENSITY.find(([re]) => re.test(name))?.[1] ?? 1;
    return round(qty * VOLUME_ML[unit]! * density);
  }
  if (unit === "can") return round(qty * 425);
  if (unit === "pkg") return round(qty * 450);
  if (unit === "slice") return round(qty * 30);
  // count of items (clove, stalk, bunch, or no unit at all)
  const each = EACH_G.find(([re]) => re.test(name))?.[1];
  if (unit === "clove") return round(qty * 3);
  if (unit === "stalk") return round(qty * 40);
  if (unit === "bunch") return round(qty * 100);
  return each ? round(qty * each) : null;
}

const round = (x: number) => Math.round(x * 10) / 10;
