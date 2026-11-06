import { createApp } from "./app.js";
import { authConfigFromEnv } from "./auth.js";
import { openDatabase } from "./db/index.js";

const port = Number(process.env.PORT ?? 3001);
const db = openDatabase(process.env.TASTETRAIL_DB ?? "tastetrail.db");
const app = createApp(db, authConfigFromEnv());

app.listen(port, () => console.log(`TasteTrail API listening on http://localhost:${port}`));
