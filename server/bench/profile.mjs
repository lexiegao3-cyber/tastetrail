// Times each data-access stage of the recommendation request for one user.
//   DATABASE_URL=... node bench/profile.mjs <userId>   (after npm run build)
import pg from "pg";
import { Repository } from "../dist/repository.js";
import { bannedFlags } from "../dist/ranking/restrictions.js";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = { query: async (t, p = []) => (await pool.query(t, p)).rows, transaction: (f) => f(db), close: () => pool.end() };
const repo = new Repository(db);
const uid = Number(process.argv[2] ?? 1);
const prefs = await repo.getPreferences(uid);
const time = async (name, f) => { const t = performance.now(); const r = await f(); console.log(name, (performance.now() - t).toFixed(0), "ms", r?.length ?? r?.size); };
for (let i = 0; i < 2; i++) {
  await time("candidates", () => repo.candidates(uid, { banned: bannedFlags(prefs.restrictions), equipment: prefs.equipment, maxMinutes: prefs.maxMinutes }));
  await time("itemSimilarity", () => repo.itemSimilarity(uid));
  await time("history", () => repo.history(uid));
}
await pool.end();
