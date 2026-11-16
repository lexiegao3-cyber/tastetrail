/**
 * Controlled vocabularies shared by the API, the ranking engine and the client.
 * Ingredient "flags" are the bridge between foods and dietary restrictions:
 * every restriction compiles down to a set of banned flags (see ranking/restrictions.ts).
 */

export const CUISINES = [
  "american",
  "chinese",
  "japanese",
  "korean",
  "thai",
  "vietnamese",
  "indian",
  "mexican",
  "italian",
  "mediterranean",
] as const;
export type Cuisine = (typeof CUISINES)[number];

export const TAGS = ["breakfast", "quick", "high-protein", "meal-prep", "budget", "spicy", "comfort"] as const;
export type Tag = (typeof TAGS)[number];

export const EQUIPMENT = ["stove", "oven", "microwave"] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const GOALS = ["maintain", "lose", "gain"] as const;
export type Goal = (typeof GOALS)[number];

/** Vegetarian spectrum, from least to most restrictive. */
export const DIETS = ["none", "flexitarian", "pescatarian", "lacto-ovo", "lacto", "ovo", "vegan"] as const;
export type Diet = (typeof DIETS)[number];

/** The nine major food allergens defined by U.S. law (FALCPA 2004 + FASTER Act 2021). */
export const ALLERGENS = ["milk", "egg", "fish", "shellfish", "tree-nut", "peanut", "wheat", "soy", "sesame"] as const;
export type Allergen = (typeof ALLERGENS)[number];

export const RELIGIOUS = ["halal", "kosher", "hindu", "jain", "buddhist", "lent-fridays"] as const;
export type Religious = (typeof RELIGIOUS)[number];

export const OTHER_DIETS = ["gluten-free", "lactose-free", "low-sugar", "low-sodium"] as const;
export type OtherDiet = (typeof OTHER_DIETS)[number];

/** Ingredient flags. Allergen flags are prefixed with "a:". */
export const FLAGS = [
  "meat",
  "beef",
  "pork",
  "poultry",
  "fish",
  "shellfish",
  "egg",
  "dairy",
  "honey",
  "gelatin",
  "alcohol",
  "root",
  "allium",
  ...ALLERGENS.map((a) => `a:${a}` as const),
] as const;
export type Flag = (typeof FLAGS)[number];

export const MODES = ["everyday", "fitness"] as const;
export type Mode = (typeof MODES)[number];

export const THEMES = ["friends", "birthday", "date", "team", "business", "family"] as const;
export type Theme = (typeof THEMES)[number];

export const RESTAURANT_CUISINES = [
  "hotpot",
  "korean-bbq",
  "japanese",
  "chinese",
  "thai",
  "vietnamese",
  "indian",
  "mexican",
  "italian",
  "mediterranean",
  "american-bbq",
  "american",
] as const;
export type RestaurantCuisine = (typeof RESTAURANT_CUISINES)[number];
