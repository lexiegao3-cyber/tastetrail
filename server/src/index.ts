import { existsSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import { createApp } from "./app.js";
import { authConfigFromEnv } from "./auth.js";
import { openDatabase, refreshPopularity } from "./db/index.js";

const port = Number(process.env.PORT ?? 3001);
const db = await openDatabase({ url: process.env.DATABASE_URL, dataDir: process.env.PLATEWISE_DATA_DIR ?? "./pgdata" });
const app = createApp(db, authConfigFromEnv());

// In production one service serves both the API and the built client, so the
// app has a single origin (no CORS) and client routes such as /handoff/* work.
const clientDist = resolve(process.env.PLATEWISE_CLIENT_DIST ?? "../client/dist");
if (existsSync(resolve(clientDist, "index.html"))) {
  app.use(express.static(clientDist, { index: false, maxAge: "1h" }));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve(clientDist, "index.html")));
  console.log(`Serving client from ${clientDist}`);
}

// Saves and cooks feed popularity and CF degrees; refresh them every 10 minutes.
setInterval(() => refreshPopularity(db, true).catch((e) => console.error("popularity refresh failed", e)), 10 * 60_000).unref();

app.listen(port, () => console.log(`PlateWise listening on http://localhost:${port}`));
