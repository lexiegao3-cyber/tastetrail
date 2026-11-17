// Prints EXPLAIN ANALYZE for the candidate query of one user (after npm run build).
//   DATABASE_URL=... [JIT=off] node bench/explain.mjs <userId> ['{"cuisine":"italian"}']
import pg from "pg";
import { Repository } from "../dist/repository.js";
import { bannedFlags } from "../dist/ranking/restrictions.js";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
let captured;
const db = { query: async (t, p = []) => { captured = [t, p]; return []; }, transaction: (f) => f(db), close: () => pool.end() };
const repo = new Repository(db);
const real = new Repository({ query: async (t, p = []) => (await pool.query(t, p)).rows });
const uid = Number(process.argv[2] ?? 1);
const prefs = await real.getPreferences(uid);
await repo.candidates(uid, { banned: bannedFlags(prefs.restrictions), equipment: prefs.equipment, maxMinutes: prefs.maxMinutes, ...JSON.parse(process.argv[3] ?? "{}") });
if (process.env.JIT === "off") await pool.query("SET jit = off");
if (process.env.RPC) await pool.query(`SET random_page_cost = ${Number(process.env.RPC)}`);
const rows = (await pool.query("EXPLAIN (ANALYZE, COSTS OFF, BUFFERS OFF) " + captured[0], captured[1])).rows;
console.log(rows.map((r) => r["QUERY PLAN"]).join("\n"));
await pool.end();
