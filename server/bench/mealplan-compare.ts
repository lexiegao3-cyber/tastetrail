// Greedy vs integer-programming day plans on random candidate sets.
//   npx tsx bench/mealplan-compare.ts [instances=500]
import type { Ranked } from "../src/ranking/engine.js";
import { planDay, planDayIlp, planObjective } from "../src/ranking/mealplan.js";
import type { Candidate } from "../src/repository.js";

const N = Number(process.argv[2] ?? 500);
const t = { dailyKcal: 2000, proteinG: 90, dailyBudget: 20 };
let s = 11;
const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
const rows = { greedy: [] as ReturnType<typeof planObjective>[], ilp: [] as ReturnType<typeof planObjective>[] };
const ms: number[] = [];
let full = 0;
for (let k = 0; k < N; k++) {
  const ranked: Ranked[] = Array.from({ length: 90 }, (_, i) => ({
    score: 0.3 + 0.6 * rnd(), components: {}, reasons: [],
    recipe: { id: `r${i}`, kcal: 250 + Math.round(700 * rnd()), protein: 5 + Math.round(45 * rnd()), servings: 2,
      missing_cost: Math.round(rnd() * 1600) / 100, tags: i % 4 === 0 ? ["breakfast"] : [], food_ids: [] } as unknown as Candidate,
  })).sort((a, b) => b.score - a.score);
  const g = planDay(ranked, t.dailyKcal, t.dailyBudget);
  const t0 = performance.now();
  const { plan } = planDayIlp(ranked, t);
  ms.push(performance.now() - t0);
  if (g.length < 3) continue;
  full++;
  rows.greedy.push(planObjective(g, t));
  rows.ilp.push(planObjective(plan, t));
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const report = (name: "greedy" | "ilp") => {
  const r = rows[name];
  return {
    method: name,
    meanAbsKcalDeviation: Math.round(mean(r.map((x) => Math.abs(x.kcal - t.dailyKcal)))),
    within10pct: +(r.filter((x) => Math.abs(x.kcal - t.dailyKcal) <= 0.1 * t.dailyKcal).length / r.length).toFixed(3),
    proteinMet: +(r.filter((x) => x.protein >= t.proteinG).length / r.length).toFixed(3),
    meanScore: +mean(r.map((x) => x.score)).toFixed(3),
    meanObjective: +mean(r.map((x) => x.objective)).toFixed(3),
  };
};
ms.sort((a, b) => a - b);
console.log(JSON.stringify({ instances: full, results: [report("greedy"), report("ilp")], ilpSolveMs: { p50: +ms[Math.floor(ms.length / 2)]!.toFixed(1), p95: +ms[Math.floor(ms.length * 0.95)]!.toFixed(1) } }, null, 2));
