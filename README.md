# PlateWise

Personalized meal recommendations for the U.S. market. PlateWise ranks recipes against your taste, calorie and protein targets, cooking time, budget and what is already in your kitchen. It explains every pick, turns a bag of recipes into a grocery list for Instacart or Kroger, and recommends a restaurant a whole group can agree on. The UI switches between English and Chinese and is built mobile-first.

The project plan, including the literature behind every scoring factor, is in [docs/PLAN.md](docs/PLAN.md) (Chinese).

| Sign up | Picks | Recipe | Bag | Today (中文) |
| --- | --- | --- | --- | --- |
| ![](docs/screenshots/m-auth.jpg) | ![](docs/screenshots/m-home.jpg) | ![](docs/screenshots/m-recipe.jpg) | ![](docs/screenshots/m-bag.jpg) | ![](docs/screenshots/m-today.jpg) |

![Desktop](docs/screenshots/d-home.jpg)

## What it does

- **Two modes, one ranking engine.** *Everyday* (students and office workers: fast, cheap, uses what you have, optional low-sugar / low-sodium flags) and *Fitness* (cut or bulk: per-meal kcal and protein targets).
- **Dietary restrictions as hard filters, in three classes.** Vegetarian type (flexitarian, pescatarian, lacto-ovo, lacto, ovo, vegan), the FDA's 9 major allergens, and religious rules (halal, kosher including the meat-and-dairy combination check, Hindu, Jain, Buddhist, Lent Fridays computed from the Easter date). Recipes that need certified meat get a note instead of a false promise.
- **Six scoring factors with explanations.** Taste .25, nutrition .20, convenience (time + pantry) .15, collaborative filtering .15, familiarity .15, price .10. Weights renormalize when a factor has no signal (for example, CF for a brand-new user). Each pick carries reason codes the client renders in either language, and MMR re-ranking keeps the list varied.
- **Item-item collaborative filtering in SQL.** Cosine similarity over co-likes from imported ratings (≥ 4 stars) plus other users' saves and "cooked" logs.
- **Virtual fridge.** Logging a cooked recipe consumes pantry stock. Items about to expire boost recipes that use them.
- **Grocery hand-off.** The bag merges ingredients across recipes, subtracts what you have, prices the rest, and opens an Instacart shopping list (live through the Instacart Developer Platform when `INSTACART_API_KEY` is set, otherwise a mock page) or a Kroger cart (mock).
- **"Did you buy it?"** Every hand-off (grocery, DoorDash / Uber Eats, Google Maps) is stored as an intent. When you come back, the app asks once. A *yes* writes an order, pantry stock or a restaurant visit, which feeds future rankings. This is how PlateWise learns without access to partner order history, which those platforms do not expose.
- **Day planner.** Greedy breakfast / lunch / dinner plan within the daily kcal target and three meal budgets.
- **Group dining.** Party size, occasion, cuisine, per-person budget, time and max travel. Each participant has a starting area and restrictions. Hard filters (open at that hour, travel limit, everyone's diet), then six factors: taste .25 (average without misery), travel fairness .20 (the longest trip, not the average), price .15, occasion fit .15, reputation .15 (Bayesian-smoothed rating), history .10. Each result opens Google Maps and shows the phone number; PlateWise does not book tables.

## Stack

```
client/   React 19 + Vite + TypeScript, i18n context (en/zh), Outfit Variable, no UI kit
server/   Node 22 + Express 5 + TypeScript, Zod validation, JWT (jose) + bcrypt
          PostgreSQL via node-postgres; embedded PGlite (WASM Postgres) for dev and tests
          raw parameterized SQL, materialized view recipe_nutrition, GIN + pg_trgm indexes
          ranking/ (pure functions: engine, mealplan, group, restrictions)
          providers/ (Instacart, Kroger, deep links), etl/ (RecipeNLG importer)
```

## Run it

```bash
cd server && npm install && npm run dev     # API on :3001, data in ./pgdata (PGlite)
cd client && npm install && npm run dev     # UI on :5173, proxies /api to :3001
```

Tests: `cd server && npm test` (31 unit + API tests, each on a fresh in-memory PGlite).

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | unset | Use a real PostgreSQL instead of embedded PGlite |
| `PLATEWISE_DATA_DIR` | `./pgdata` | PGlite data directory |
| `PLATEWISE_JWT_SECRET` | dev value | Required in production |
| `PLATEWISE_JWT_TTL_SECONDS` | `7200` | Token lifetime |
| `INSTACART_API_KEY` | unset | Live Instacart shopping-list links |
| `PORT` | `3001` | API port |

### Deploy

In production one Node service serves both the API and the built client (`server/dist` + `client/dist`), so there is a single URL and no CORS setup.

1. Create a free Postgres database on [Neon](https://neon.tech) and copy its connection string (it ends in `?sslmode=require`).
2. On [Render](https://render.com): **New → Blueprint**, pick this repository. `render.yaml` defines the service, build and start commands, and a health check on `/api/health`. Paste the Neon string into `DATABASE_URL` when asked; the JWT secret is generated for you.
3. Tables, the materialized view and the seed catalog are created on first start.

Without `DATABASE_URL` the service falls back to embedded PGlite on the instance disk, which Render wipes on every deploy. Render's free tier also sleeps after 15 minutes idle, so the first request after that takes about a minute.

To run the production build locally: `cd client && npm run build`, then `cd server && npm run build && npm start`, and open http://localhost:3001.

### Importing real recipes

The seed catalog is 32 bilingual demo recipes over 67 foods. To load RecipeNLG (research use only; download it yourself, the CSV is not committed):

```bash
cd server && npm run etl:recipenlg -- path/to/full_dataset.csv --limit 20000
```

The importer parses quantities and units ("2 cups chopped onion" → onion, grams), matches each line to a known food with trigram similarity (≥ 0.35), and skips a recipe if any ingredient over 5 g can't be matched. Imported recipes get `minutes` estimated from the step count and a default cuisine, so treat them as raw material for tagging.

## Caveats

- Nutrient values and $/100 g prices in the seed data are approximate sample values, not USDA lookups. Load FoodData Central before trusting the numbers.
- The 16 restaurants are fictional (555 phone numbers) around six Boston neighborhoods, so group dining works offline. Production would use the Google Places API.
- Deep-link formats for DoorDash (`/search/store/<q>/`) and Uber Eats (`/search?q=`) are not documented APIs and should be re-checked.
- Kroger checkout is a mock until OAuth credentials are added.
- Restriction filters depend on ingredient tagging. The UI tells users to check labels and tell the restaurant about allergies. Not medical advice.

## History

PlateWise started as TasteTrail, a book recommender. The explainable multi-factor ranking, MMR re-ranking and feedback loop carried over; the domain, data layer (SQLite → PostgreSQL), restrictions, hand-offs, group dining and UI are new.
