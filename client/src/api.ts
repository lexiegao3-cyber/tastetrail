export interface Nutrition {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar: number;
  sodiumMg: number;
}

export interface Recipe {
  id: string;
  title: { en: string; zh: string };
  emoji: string;
  cuisine: string;
  tags: string[];
  minutes: number;
  steps?: number;
  servings: number;
  equipment?: string[];
  nutrition: Nutrition;
  costPerServing: number;
  flags: string[];
  pantry?: { have: number; total: number; expiring: number; missingCost: number };
}

export interface Reason {
  code: string;
  factor: string;
  params?: Record<string, string | number>;
  weight: number;
}

export interface Recommendation {
  recipe: Recipe;
  score: number;
  components: Record<string, number>;
  reasons: Reason[];
}

export interface Restrictions {
  diet: string;
  allergens: string[];
  religious: string[];
  other: string[];
}

export interface Preferences {
  goal: string;
  mode: "everyday" | "fitness";
  dailyKcal: number;
  proteinG: number;
  cuisines: string[];
  restrictions: Restrictions;
  equipment: string[];
  maxMinutes: number;
  mealBudget: number;
  zip: string;
  area: string;
}

export interface Neighborhood {
  id: string;
  en: string;
  zh: string;
  lat: number;
  lng: number;
}

export interface Meta {
  cuisines: string[];
  tags: string[];
  equipment: string[];
  goals: string[];
  modes: string[];
  diets: string[];
  allergens: string[];
  religious: string[];
  other: string[];
  themes: string[];
  restaurantCuisines: string[];
  neighborhoods: Neighborhood[];
}

export interface Ingredient {
  food_id: string;
  name_en: string;
  name_zh: string;
  grams: number;
  have_grams: number;
  price: number;
  flags: string[];
}

export interface RecipeDetail extends Recipe {
  saved: boolean;
  source: string;
  quantitiesEstimated: boolean;
  ingredients: Ingredient[];
  takeout: { doordash: string; ubereats: string };
}

export interface Trends {
  days: number;
  end: string;
  daily: { day: string; kcal: number; protein: number; meals: number; takeout: number }[];
  targets: { kcal: number; protein: number };
  summary: {
    loggedDays: number; avgKcal: number; avgProtein: number; daysOnTarget: number; takeoutShare: number;
    groceryUsd: number; groceryOrders: number; takeoutOrders: number; wasteItems: number; wasteUsd: number;
  };
}

export interface ShoppingItem {
  food_id: string;
  name_en: string;
  name_zh: string;
  grams: number;
  est_usd: number;
  recipes: string[];
}

export interface PantryItem {
  id: number;
  food_id: string;
  name_en: string;
  name_zh: string;
  grams: number;
  days_left: number;
}

export interface MealLog {
  id: number;
  recipe_id: string | null;
  label: string;
  title_zh: string | null;
  emoji: string | null;
  source: string;
  kcal: number;
  protein: number;
}

export interface DayLog {
  day: string;
  items: MealLog[];
  totals: { kcal: number; protein: number; carbs: number; fat: number; sugar: number; sodium_mg: number; meals: number };
  targets: { kcal: number; protein: number; sodiumMg: number };
}

export interface Intent {
  id: number;
  kind: "grocery" | "takeout" | "restaurant";
  provider: string;
  url: string;
  payload: { label?: string };
}

export interface Participant {
  name: string;
  origin: { lat: number; lng: number };
  likes: string[];
  avoids: string[];
  restrictions: Restrictions;
}

export interface PollOption {
  id: string; name: string; cuisine: string; priceMin: number; priceMax: number; phone: string; mapsUrl: string;
}
export interface Poll {
  title: string;
  expiresAt: string;
  options: (PollOption & { voters: string[] })[];
}

export interface GroupResult {
  restaurant: {
    id: string; name: string; cuisine: string; price_min: number; price_max: number; rating: number; review_count: number;
    phone: string; attrs: Record<string, boolean>;
  };
  score: number;
  components: Record<string, number>;
  travel: { name: string; minutes: number }[];
  reasons: { code: string; params?: Record<string, string | number>; weight: number }[];
  warnings: string[];
  mapsUrl: string;
}

const TOKEN_KEY = "platewise.token";
let token: string | null = null;
try {
  token = localStorage.getItem(TOKEN_KEY);
} catch {
  /* storage blocked */
}

function setToken(t: string | null) {
  token = t;
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) setToken(null);
    const detail = data.issues?.map((i: { path: string; message: string }) => `${i.path}: ${i.message}`).join("; ");
    throw new ApiError(res.status, detail || data.error || res.statusText);
  }
  return data as T;
}

/** Local calendar day and hour, so "today" means the user's today. */
export function clock() {
  const d = new Date();
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { day, hour: d.getHours() };
}

export const api = {
  hasToken: () => token !== null,
  logout: () => setToken(null),
  async auth(mode: "login" | "register", email: string, password: string) {
    const r = await call<{ token: string; email: string }>("POST", `/api/auth/${mode}`, { email, password });
    setToken(r.token);
    return r.email;
  },
  me: () => call<{ email: string; preferences: Preferences }>("GET", "/api/me"),
  meta: () => call<Meta>("GET", "/api/meta"),
  savePreferences: (p: Preferences) => call<Preferences>("PUT", "/api/preferences", p),
  recommend: (o: { mode?: string; cuisine?: string; q?: string; limit?: number }) =>
    call<{ items: Recommendation[]; intake: { kcal: number } }>("POST", "/api/recommendations", { ...o, ...clock() }),
  mealPlan: () => call<{ items: { slot: string; recipe: Recipe }[]; totalKcal: number; totalProtein: number; targetKcal: number; targetProtein: number; solver: string }>("POST", "/api/meal-plan", { day: clock().day }),
  recipe: (id: string) => call<RecipeDetail>("GET", `/api/recipes/${encodeURIComponent(id)}`),
  interact: (recipeId: string, kind: "save" | "dismiss") => call("POST", "/api/interactions", { recipeId, kind }),
  unsave: (recipeId: string) => call("DELETE", `/api/interactions/${encodeURIComponent(recipeId)}/save`),
  trends: (days = 14) => call<Trends>("GET", `/api/trends?day=${clock().day}&days=${days}`),
  dayLog: () => call<DayLog>("GET", `/api/meal-logs?day=${clock().day}`),
  logRecipe: (recipeId: string, servings = 1) => call("POST", "/api/meal-logs", { recipeId, servings, day: clock().day }),
  logManual: (label: string, kcal: number, source: "manual" | "takeout") => call("POST", "/api/meal-logs", { label, kcal, source, day: clock().day }),
  deleteLog: (id: number) => call("DELETE", `/api/meal-logs/${id}`),
  pantry: () => call<{ items: PantryItem[] }>("GET", "/api/pantry"),
  addPantry: (foodId: string, grams: number) => call("POST", "/api/pantry", { foodId, grams }),
  deletePantry: (id: number) => call("DELETE", `/api/pantry/${id}`),
  foods: (q: string) => call<{ items: { id: string; name_en: string; name_zh: string }[] }>("GET", `/api/foods?q=${encodeURIComponent(q)}`),
  shoppingList: (recipeIds: string[]) => call<{ items: ShoppingItem[]; estTotal: number }>("POST", "/api/shopping-list", { recipeIds }),
  checkout: (recipeIds: string[], provider: "instacart" | "kroger") =>
    call<{ url: string; mode: string; intentId: number }>("POST", "/api/checkout", { recipeIds, provider }),
  takeout: (provider: "doordash" | "ubereats", query: string) => call<{ url: string; intentId: number }>("POST", "/api/takeout", { provider, query }),
  pending: () => call<{ items: Intent[] }>("GET", "/api/intents/pending"),
  resolve: (id: number, confirmed: boolean) => call("POST", `/api/intents/${id}`, { confirmed }),
  group: (q: unknown) => call<{ items: GroupResult[]; source: "demo" | "google-places" }>("POST", "/api/group/recommendations", q),
  visit: (restaurantId: string, name: string, mapsUrl?: string) =>
    call<{ url: string; intentId: number }>("POST", "/api/group/visit", { restaurantId, name, mapsUrl }),
  createPoll: (title: string, options: PollOption[]) => call<{ token: string; path: string }>("POST", "/api/group/polls", { title, options }),
  poll: (token: string) => call<Poll>("GET", `/api/polls/${encodeURIComponent(token)}`),
  vote: (token: string, name: string, optionId: string) => call("POST", `/api/polls/${encodeURIComponent(token)}/vote`, { name, optionId }),
};
