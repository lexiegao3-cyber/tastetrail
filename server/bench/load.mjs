// Load test for POST /api/recommendations against a running server.
//   node bench/load.mjs [baseUrl=http://localhost:3001] [requests=400] [concurrency=8] [users=20]
// Each virtual user gets preferences, a pantry and a few saved recipes first, so
// the pantry-coverage and collaborative-filtering stages do real work.
const [base = "http://localhost:3001", nReq = "400", conc = "8", nUsers = "20"] = process.argv.slice(2);

async function call(path, body, token, method = "POST") {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

const DIETS = ["none", "none", "none", "pescatarian", "lacto-ovo", "vegan"];
const tokens = [];
for (let i = 0; i < Number(nUsers); i++) {
  const { token } = await call("/api/auth/register", { email: `bench${Date.now()}_${i}@platewise.dev`, password: "benchmark-pw" });
  const prefs = await call("/api/me", undefined, token, "GET").then((r) => r.preferences);
  await call("/api/preferences", {
    ...prefs,
    mode: i % 3 === 0 ? "fitness" : "everyday",
    equipment: ["stove", "oven", "microwave"],
    maxMinutes: 45 + (i % 4) * 15,
    restrictions: { ...prefs.restrictions, diet: DIETS[i % DIETS.length], allergens: i % 5 === 0 ? ["peanut", "shellfish"] : [] },
  }, token, "PUT");
  for (const q of ["onion", "garlic", "eggs", "rice", "chicken"]) {
    const { items } = await call(`/api/foods?q=${q}`, undefined, token, "GET");
    if (items[0]) await call("/api/pantry", { foodId: items[0].id, grams: 300 }, token);
  }
  const { items } = await call("/api/recommendations", {}, token);
  for (const it of items.slice(i % 3, (i % 3) + 4)) await call("/api/interactions", { recipeId: it.recipe.id, kind: "save" }, token);
  tokens.push(token);
}

const MODES = [{}, { mode: "fitness" }, { cuisine: "italian" }, { q: "chicken" }, {}];
const times = [];
let next = 0;
const t0 = performance.now();
await Promise.all(Array.from({ length: Number(conc) }, async () => {
  while (next < Number(nReq)) {
    const i = next++;
    const t = performance.now();
    await call("/api/recommendations", MODES[i % MODES.length], tokens[i % tokens.length]);
    times.push(performance.now() - t);
  }
}));
const wall = (performance.now() - t0) / 1000;
times.sort((a, b) => a - b);
const pct = (p) => times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))].toFixed(0);
console.log(JSON.stringify({ requests: times.length, concurrency: Number(conc), p50_ms: +pct(50), p95_ms: +pct(95), p99_ms: +pct(99), max_ms: +times.at(-1).toFixed(0), rps: +(times.length / wall).toFixed(1) }));
