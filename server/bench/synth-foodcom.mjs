// Writes synthetic RAW_recipes.csv / RAW_interactions.csv in Food.com's format and
// at its scale, for load-testing the importer, evaluation and SQL. Not real data:
// never report recommendation quality measured on it.
//   node bench/synth-foodcom.mjs <outDir> [recipes=231637] [ratings=1132367]
import { createWriteStream, mkdirSync } from "node:fs";

const [out = "/tmp/synth", nR = "231637", nI = "1132367"] = process.argv.slice(2);
const R = Number(nR), I = Number(nI);
mkdirSync(out, { recursive: true });
let s = 7;
const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);

const BASE = ["salt", "butter", "sugar", "onion", "garlic", "eggs", "olive oil", "flour", "water", "milk", "black pepper", "pepper",
  "garlic cloves", "all-purpose flour", "brown sugar", "baking soda", "lemon juice", "vegetable oil", "parmesan cheese", "baking powder",
  "ground cinnamon", "soy sauce", "chicken broth", "ground beef", "boneless skinless chicken breasts", "cheddar cheese", "sour cream",
  "cream cheese", "tomatoes", "carrots", "celery", "green onions", "fresh parsley", "honey", "dijon mustard", "rice", "spaghetti",
  "shrimp", "bacon", "mozzarella cheese", "red bell pepper", "jalapeno", "cumin", "chili powder", "dried oregano", "fresh basil",
  "potatoes", "zucchini", "mushrooms", "spinach", "black beans", "corn tortillas", "salsa", "avocado", "lime juice", "cilantro",
  "ginger", "sesame oil", "rice vinegar", "peanut butter", "walnuts", "almonds", "heavy cream", "chicken thighs", "pork chops",
  "salmon fillets", "canned tomatoes", "tomato paste", "red wine", "dry white wine", "worcestershire sauce", "mayonnaise", "tofu"];
const VOCAB = [...BASE, ...Array.from({ length: 4000 }, (_, i) => `ingredient ${i}`)];
const TAGS = ["main-dish", "side-dishes", "breakfast", "lunch", "easy", "30-minutes-or-less", "60-minutes-or-less", "chinese", "italian",
  "mexican", "thai", "indian", "japanese", "greek", "oven", "stove-top", "inexpensive", "high-protein", "spicy", "comfort-food", "desserts", "beverages"];
const q = (s) => `"${s.replace(/"/g, '""')}"`;
const pyList = (xs) => `[${xs.map((x) => `'${x}'`).join(", ")}]`;

const rw = createWriteStream(`${out}/RAW_recipes.csv`);
rw.write("name,id,minutes,contributor_id,submitted,tags,nutrition,n_steps,steps,description,ingredients,n_ingredients\n");
for (let id = 1; id <= R; id++) {
  const n = 4 + Math.floor(rnd() * 9);
  const ings = new Set();
  while (ings.size < n) ings.add(VOCAB[rnd() < 0.7 ? Math.floor(rnd() ** 2 * BASE.length) : BASE.length + Math.floor(rnd() ** 3 * 4000)]);
  const tags = TAGS.filter(() => rnd() < 0.15);
  const kcal = Math.round(80 + rnd() * 900);
  const nut = [kcal, ...Array.from({ length: 6 }, () => Math.round(rnd() * 80))];
  const steps = Array.from({ length: 2 + Math.floor(rnd() * 8) }, (_, i) => (i === 0 && rnd() < 0.5 ? "preheat oven to 350" : "stir in a saucepan, simmer"));
  const line = [`synthetic recipe ${id}`, id, 5 + Math.floor(rnd() * 120), 1, "2005-01-01", q(pyList(tags)), q(`[${nut.join(", ")}]`),
    steps.length, q(pyList(steps)), "", q(pyList([...ings])), ings.size].join(",");
  if (!rw.write(line + "\n")) await new Promise((r) => rw.once("drain", r));
}
await new Promise((r) => rw.end(r));

const iw = createWriteStream(`${out}/RAW_interactions.csv`);
iw.write("user_id,recipe_id,date,rating,review\n");
const users = 226570;
for (let i = 0; i < I; i++) {
  const u = Math.floor(rnd() ** 3 * users); // a few heavy raters, a long tail of one-off users
  const item = 1 + Math.floor(rnd() ** 2.5 * R); // popular recipes collect most ratings
  const t = Date.UTC(2000, 0, 1) + rnd() * (Date.UTC(2018, 11, 31) - Date.UTC(2000, 0, 1));
  const rating = rnd() < 0.06 ? 0 : rnd() < 0.72 ? 5 : 1 + Math.floor(rnd() * 4);
  if (!iw.write(`${u},${item},${new Date(t).toISOString().slice(0, 10)},${rating},ok\n`)) await new Promise((r) => iw.once("drain", r));
}
await new Promise((r) => iw.end(r));
console.log(`wrote ${R} recipes and ${I} interactions to ${out}`);
