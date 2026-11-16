import type { Ranked } from "./engine.js";

export interface PlanSlot {
  slot: "breakfast" | "lunch" | "dinner";
  pick: Ranked;
}

const SHARE = { breakfast: 0.25, lunch: 0.375, dinner: 0.375 } as const;

/**
 * Greedy day plan: fill breakfast, lunch and dinner from ranked candidates so the
 * total lands near the calorie target and stays within the daily food budget,
 * preferring recipes that share ingredients (buy less, waste less).
 * Version 1 of the plan; an integer-programming solver is the planned upgrade.
 */
export function planDay(ranked: Ranked[], dailyKcal: number, dailyBudget: number): PlanSlot[] {
  const out: PlanSlot[] = [];
  let spent = 0;
  const used = new Set<string>();
  const foods = new Set<string>();
  for (const slot of ["breakfast", "lunch", "dinner"] as const) {
    const target = dailyKcal * SHARE[slot];
    const pool = ranked.filter((r) => !used.has(r.recipe.id) && (slot === "breakfast") === r.recipe.tags.includes("breakfast"));
    let best: Ranked | undefined;
    let bestV = -Infinity;
    for (const r of pool) {
      const c = r.recipe;
      const cost = c.missing_cost / c.servings;
      if (spent + cost > dailyBudget) continue;
      const kcalPenalty = Math.abs(c.kcal - target) / target;
      const overlap = c.food_ids.filter((f) => foods.has(f)).length / c.food_ids.length;
      const v = r.score - 0.5 * kcalPenalty + 0.15 * overlap;
      if (v > bestV) [bestV, best] = [v, r];
    }
    if (!best) continue;
    out.push({ slot, pick: best });
    used.add(best.recipe.id);
    best.recipe.food_ids.forEach((f) => foods.add(f));
    spent += best.recipe.missing_cost / best.recipe.servings;
  }
  return out;
}
