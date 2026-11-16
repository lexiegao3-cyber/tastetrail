import type { Allergen, Diet, Flag, OtherDiet, Religious } from "../vocab.js";

export interface Restrictions {
  diet: Diet;
  allergens: Allergen[];
  religious: Religious[];
  other: OtherDiet[];
}

export const NO_RESTRICTIONS: Restrictions = { diet: "none", allergens: [], religious: [], other: [] };

const ANIMAL_FLESH: Flag[] = ["meat", "beef", "pork", "poultry", "fish", "shellfish", "gelatin"];

const DIET_BANS: Record<Diet, Flag[]> = {
  none: [],
  flexitarian: [],
  pescatarian: ["meat", "beef", "pork", "poultry", "gelatin"],
  "lacto-ovo": ANIMAL_FLESH,
  lacto: [...ANIMAL_FLESH, "egg"],
  ovo: [...ANIMAL_FLESH, "dairy"],
  vegan: [...ANIMAL_FLESH, "egg", "dairy", "honey"],
};

/**
 * What can be judged from ingredients. Slaughter method and certification
 * cannot, so halal/kosher recipes are labelled "needs certified meat" instead.
 */
const RELIGIOUS_BANS: Record<Religious, Flag[]> = {
  halal: ["pork", "alcohol", "gelatin"],
  kosher: ["pork", "shellfish", "gelatin"],
  hindu: ["beef"],
  jain: [...ANIMAL_FLESH, "egg", "root", "allium", "honey"],
  buddhist: [...ANIMAL_FLESH, "allium"],
  "lent-fridays": ["meat", "beef", "pork", "poultry"],
};

/** Western Easter (anonymous Gregorian algorithm), UTC date. */
export function easter(year: number): Date {
  const a = year % 19,
    b = Math.floor(year / 100),
    c = year % 100,
    d = Math.floor(b / 4),
    e = b % 4,
    f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4),
    k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7,
    m = Math.floor((a + 11 * h + 22 * l) / 451),
    month = Math.floor((h + l - 7 * m + 114) / 31),
    day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/** Lent runs from Ash Wednesday (Easter − 46 days) to Holy Saturday. */
export function isLentFriday(date: Date): boolean {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  if (day.getUTCDay() !== 5) return false;
  const e = easter(day.getUTCFullYear()).getTime();
  const ash = e - 46 * 864e5;
  return day.getTime() >= ash && day.getTime() < e;
}

/** Compile restrictions into the set of ingredient flags a recipe must not contain. */
export function bannedFlags(r: Restrictions, on: Date = new Date()): Flag[] {
  const out = new Set<Flag>(DIET_BANS[r.diet]);
  for (const a of r.allergens) out.add(`a:${a}`);
  for (const rel of r.religious) {
    if (rel === "lent-fridays" && !isLentFriday(on)) continue;
    for (const f of RELIGIOUS_BANS[rel]) out.add(f);
  }
  if (r.other.includes("gluten-free")) out.add("a:wheat");
  if (r.other.includes("lactose-free")) out.add("dairy");
  return [...out].sort();
}

/** Kosher also forbids meat and dairy in the same dish, which flags alone can't express. */
export function violatesCombination(r: Restrictions, recipeFlags: readonly string[]): boolean {
  if (!r.religious.includes("kosher")) return false;
  const hasMeat = recipeFlags.includes("meat") || recipeFlags.includes("poultry");
  return hasMeat && recipeFlags.includes("dairy");
}

/** Merge several people's restrictions: the union of everything anyone must avoid. */
export function unionRestrictions(list: Restrictions[]): Restrictions {
  const order: Diet[] = ["none", "flexitarian", "pescatarian", "lacto-ovo", "lacto", "ovo", "vegan"];
  let diet: Diet = "none";
  const dietSet = new Set(list.map((r) => r.diet));
  // lacto + ovo together means neither dairy nor eggs: vegan-equivalent.
  if (dietSet.has("lacto") && dietSet.has("ovo")) diet = "vegan";
  else for (const r of list) if (order.indexOf(r.diet) > order.indexOf(diet)) diet = r.diet;
  const uniq = <T>(xs: T[]) => [...new Set(xs)];
  return {
    diet,
    allergens: uniq(list.flatMap((r) => r.allergens)),
    religious: uniq(list.flatMap((r) => r.religious)),
    other: uniq(list.flatMap((r) => r.other)),
  };
}

/** Religious rules whose certification can't be checked from a recipe. */
export const needsCertifiedMeat = (r: Restrictions) => r.religious.includes("halal") || r.religious.includes("kosher");
