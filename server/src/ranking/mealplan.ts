import lp from "javascript-lp-solver";
import type { Ranked } from "./engine.js";

// The package is CommonJS with ESM-style typings: at runtime the default import is
// the solver itself, while TypeScript sees the module namespace.
type LpSolver = (typeof lp)["default"];
const solver = ((lp as { default?: LpSolver }).default ?? lp) as LpSolver;

export interface PlanSlot {
  slot: "breakfast" | "lunch" | "dinner";
  pick: Ranked;
}

const SHARE = { breakfast: 0.25, lunch: 0.375, dinner: 0.375 } as const;

/**
 * Greedy day plan: fill breakfast, lunch and dinner from ranked candidates so the
 * total lands near the calorie target and stays within the daily food budget,
 * preferring recipes that share ingredients (buy less, waste less).
 * Kept as the fallback when the integer program is infeasible (e.g. budget).
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
      const overlap = c.food_ids.length ? c.food_ids.filter((f) => foods.has(f)).length / c.food_ids.length : 0;
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

export interface PlanTargets {
  dailyKcal: number;
  proteinG: number;
  dailyBudget: number;
}

/** Penalty weights shared by the solver and by planObjective, so both are judged by the same yardstick. */
const KCAL_PENALTY = 1.5; // per 100% deviation from the daily kcal target
const PROTEIN_PENALTY = 1.0; // per 100% shortfall from the daily protein target
const PER_SLOT = 30;

const slotPool = (ranked: Ranked[], slot: PlanSlot["slot"]) =>
  ranked.filter((r) => (slot === "breakfast") === r.recipe.tags.includes("breakfast")).slice(0, PER_SLOT);

/**
 * Integer program over the top candidates per slot (binary x[slot, recipe]):
 *   maximize   Σ score·x − 1.5·|kcal − target|/target − 1.0·protein shortfall/target
 *   subject to one recipe per slot (when the slot has candidates), each recipe at
 *              most once, Σ missing cost ≤ daily budget.
 * |kcal − target| is linearized with two non-negative deviation variables. Unlike
 * the greedy plan, an early slot can give up its best match so the day as a whole
 * lands on target. Solved with branch and bound (javascript-lp-solver); falls
 * back to the greedy plan when infeasible.
 */
export function planDayIlp(ranked: Ranked[], t: PlanTargets): { plan: PlanSlot[]; solver: "ilp" | "greedy" } {
  const variables: Record<string, Record<string, number>> = {
    kcal_over: { obj: -KCAL_PENALTY / t.dailyKcal, kcal: -1 },
    kcal_under: { obj: -KCAL_PENALTY / t.dailyKcal, kcal: 1 },
    protein_short: { obj: -PROTEIN_PENALTY / t.proteinG, protein: 1 },
  };
  const constraints: Record<string, { min?: number; max?: number; equal?: number }> = {
    kcal: { equal: t.dailyKcal },
    protein: { min: t.proteinG },
    cost: { max: t.dailyBudget },
  };
  const binaries: Record<string, 1> = {};
  const lookup = new Map<string, { slot: PlanSlot["slot"]; pick: Ranked }>();
  for (const slot of ["breakfast", "lunch", "dinner"] as const) {
    const pool = slotPool(ranked, slot);
    if (!pool.length) continue;
    constraints[`slot_${slot}`] = { equal: 1 };
    pool.forEach((r, i) => {
      const c = r.recipe;
      const name = `x_${slot}_${i}`;
      variables[name] = { obj: r.score, kcal: c.kcal, protein: c.protein, cost: c.missing_cost / c.servings, [`slot_${slot}`]: 1, [`r_${c.id}`]: 1 };
      constraints[`r_${c.id}`] = { max: 1 };
      binaries[name] = 1;
      lookup.set(name, { slot, pick: r });
    });
  }
  if (!lookup.size) return { plan: [], solver: "ilp" };
  const result = solver.Solve({ optimize: "obj", opType: "max", constraints, variables, binaries }) as Record<string, number> & { feasible: boolean };
  if (!result.feasible) return { plan: planDay(ranked, t.dailyKcal, t.dailyBudget), solver: "greedy" };
  const order = { breakfast: 0, lunch: 1, dinner: 2 };
  const plan = [...lookup.entries()].filter(([name]) => (result[name] ?? 0) > 0.5).map(([, v]) => v);
  return { plan: plan.sort((a, b) => order[a.slot] - order[b.slot]), solver: "ilp" };
}

/** The ILP's objective, for comparing plans from either method. */
export function planObjective(plan: PlanSlot[], t: PlanTargets) {
  const kcal = plan.reduce((s, p) => s + p.pick.recipe.kcal, 0);
  const protein = plan.reduce((s, p) => s + p.pick.recipe.protein, 0);
  const cost = plan.reduce((s, p) => s + p.pick.recipe.missing_cost / p.pick.recipe.servings, 0);
  const score = plan.reduce((s, p) => s + p.pick.score, 0);
  return {
    objective: score - (KCAL_PENALTY * Math.abs(kcal - t.dailyKcal)) / t.dailyKcal - (PROTEIN_PENALTY * Math.max(0, t.proteinG - protein)) / t.proteinG,
    kcal, protein, cost, score,
  };
}
