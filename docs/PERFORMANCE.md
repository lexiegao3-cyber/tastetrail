# Performance at Food.com scale

`POST /api/recommendations` was load-tested on a database the size of a full Food.com import, before and after the query work below.

## Setup

- **Data**: `server/bench/synth-foodcom.mjs` writes 231,637 recipes and 1,132,367 interactions in Food.com's CSV format with skewed popularity and rater activity. The real importer (`npm run etl:foodcom`) loads them: 167,539 meal recipes, 4,072 ingredients, 1,321,390 ingredient lines, 768,554 ratings. The data is synthetic, so these numbers say nothing about recommendation quality. Rerun the same scripts after importing the real dataset.
- **Database**: PostgreSQL 16 on the same machine, default configuration. 2 vCPU.
- **Load**: `server/bench/load.mjs`: 6 users, each with preferences (some vegan or pescatarian, some with peanut and shellfish allergies), 5 pantry items and 4 saved recipes. Requests rotate through default, fitness mode, a cuisine filter and a text search.
- Server: production build (`npm run build && npm start`), node-postgres pool of 10.

## Result

| | p50 | p95 | p99 | Throughput |
| --- | --- | --- | --- | --- |
| Before, 60 requests, concurrency 4 | 8,849 ms | 11,192 ms | 12,110 ms | 0.4 req/s |
| After, 60 requests, concurrency 4 | 234 ms | 444 ms | 585 ms | 16.2 req/s |
| After, 200 requests, sequential | 75 ms | 150 ms | 178 ms | 12.6 req/s |

## What changed

Single-user stage timings were taken with `bench/profile.mjs` and plans with `bench/explain.mjs` (`EXPLAIN ANALYZE`).

| Stage | Before | After | Change |
| --- | --- | --- | --- |
| Popularity | 0.4–1.1 s, 149K rows sent to Node | 0 (joined into candidates) | `recipe_popularity` materialized view, refreshed every 10 min with `REFRESH … CONCURRENTLY` |
| Item-item CF | 1.9 s | 8 ms | Walks seed → its 200 most recent likers → their 200 most recent likes through covering indexes (`INCLUDE`) instead of self-joining every like; degrees read from `recipe_popularity` |
| Candidates | 2.0 s | 70 ms (125 ms with a rare cuisine) | See below |
| Text search | 290 ms | 8 ms | `title % $q` (trigram operator, GIN-indexable) instead of `similarity(title, $q) > 0.25`, which scanned every title |

Candidate query, step by step:

1. **Pantry coverage was computed for every recipe that passed the filters**: 75K recipes, 586K joined ingredient rows, a hash of all 1.3M ingredient lines, per request. Coverage is now computed only for a pool of at most 3 × limit recipes. The pool comes from three index walks, each stopping at the limit: pantry foods → recipes using them, popularity order, and primary key order.
2. **The pantry walk itself fanned out**: five common foods (onion, eggs…) match 31K recipes. Those are pre-ranked by match count and capped at 10 × limit before any per-recipe lookups. A covering index `recipe_ingredients(food_id) INCLUDE (recipe_id)` makes this an index-only scan.
3. **PostgreSQL's JIT compiler added about 0.9 s** to a query that runs in about 0.3 s, because the planner's cost estimate crossed `jit_above_cost`. JIT is off for the app's connections.
4. **`random_page_cost = 4`** (the spinning-disk default) made the planner seq-scan 151K rows instead of doing 2,000 primary-key lookups. The app sets 1.1, which suits SSD-backed hosts such as Neon.
5. **Startup refreshed both materialized views on every boot**, which was slow at this size and reset the visibility map, so index-only scans had to fetch from the heap again. Seeding is now skipped when a hash of the seed data is unchanged. A second boot takes 1.2 s.
6. The importer finishes with `VACUUM (ANALYZE)` so the covering indexes serve index-only scans immediately.

## Reproduce

```bash
cd server && npm run build
node bench/synth-foodcom.mjs /tmp/synth
createdb pwbench
DATABASE_URL=postgres://localhost/pwbench npm run etl:foodcom -- --recipes /tmp/synth/RAW_recipes.csv --interactions /tmp/synth/RAW_interactions.csv
DATABASE_URL=postgres://localhost/pwbench PORT=3200 npm start &
node bench/load.mjs http://localhost:3200 60 4 6
```

Limits: one machine with the database co-located, a small number of users, and synthetic data. A managed database adds network round trips (Neon's free tier also suspends compute when idle), so measure again on the deployed stack before quoting latency.
