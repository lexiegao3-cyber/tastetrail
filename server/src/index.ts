import { createApp } from "./app.js";
import { authConfigFromEnv } from "./auth.js";
import { openDatabase } from "./db/index.js";

const port = Number(process.env.PORT ?? 3001);
const db = await openDatabase({ url: process.env.DATABASE_URL, dataDir: process.env.PLATEWISE_DATA_DIR ?? "./pgdata" });
const app = createApp(db, authConfigFromEnv());

app.listen(port, () => console.log(`PlateWise API listening on http://localhost:${port}`));
