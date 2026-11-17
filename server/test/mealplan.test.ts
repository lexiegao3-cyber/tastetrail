import { describe, expect, it } from "vitest";
import type { Ranked } from "../src/ranking/engine.js";
import { planDay, planDayIlp, planObjective } from "../src/ranking/mealplan.js";
import type { Candidate } from "../src/repository.js";

function instance(seed: number, n = 40): Ranked[] {
  let s = seed;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  return Array.from({ length: n }, (_, i) => ({
    score: 0.3 + 0.6 * rnd(),
    components: {},
    reasons: [],
    recipe: {
      id: `r${i}`, kcal: 250 + Math.round(700 * rnd()), protein: 5 + Math.round(45 * rnd()), servings: 2,
      missing_cost: Math.round(rnd() * 1600) / 100, tags: i % 4 === 0 ? ["breakfast"] : [], food_ids: [`f${i % 7}`, `f${i % 5}`],
    } as unknown as Candidate,
  }));
}

const targets = { dailyKcal: 2000, proteinG: 90, dailyBudget: 20 };

describe("meal plan", () => {
  it("ILP plans are valid and never score below greedy on the shared objective", () => {
    let ilpDev = 0, greedyDev = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const ranked = instance(seed).sort((a, b) => b.score - a.score);
      const { plan, solver } = planDayIlp(ranked, targets);
      const greedy = planDay(ranked, targets.dailyKcal, targets.dailyBudget);
      expect(solver).toBe("ilp");
      expect(plan.map((p) => p.slot)).toEqual(["breakfast", "lunch", "dinner"]);
      expect(new Set(plan.map((p) => p.pick.recipe.id)).size).toBe(3);
      const a = planObjective(plan, targets), b = planObjective(greedy, targets);
      expect(a.cost).toBeLessThanOrEqual(targets.dailyBudget + 1e-6);
      if (greedy.length === 3) expect(a.objective).toBeGreaterThanOrEqual(b.objective - 1e-6);
      ilpDev += Math.abs(a.kcal - 2000);
      greedyDev += Math.abs(b.kcal - 2000);
    }
    expect(ilpDev).toBeLessThan(greedyDev);
  });

  it("falls back to greedy when the budget makes the program infeasible", () => {
    const ranked = instance(3);
    for (const r of ranked) r.recipe.missing_cost = 100;
    expect(planDayIlp(ranked, { ...targets, dailyBudget: 1 }).solver).toBe("greedy");
  });
});
