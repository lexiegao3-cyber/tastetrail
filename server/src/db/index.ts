import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { CATALOG } from "../catalog.js";
import * as schema from "./schema.js";

export type Db = BetterSQLite3Database<typeof schema>;

/**
 * Ordered, append-only migrations. Each runs once inside a transaction and
 * is recorded in schema_migrations, so restarting the server is safe and a
 * half-applied migration rolls back cleanly.
 */
const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: "0001_init",
    sql: `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE books (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        year INTEGER NOT NULL,
        pages INTEGER NOT NULL CHECK (pages > 0),
        genres TEXT NOT NULL,
        moods TEXT NOT NULL,
        popularity_bp INTEGER NOT NULL CHECK (popularity_bp BETWEEN 0 AND 10000),
        blurb TEXT NOT NULL
      );
      CREATE TABLE preferences (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        genres TEXT NOT NULL,
        moods TEXT NOT NULL,
        budget_minutes INTEGER CHECK (budget_minutes IS NULL OR budget_minutes > 0),
        words_per_minute INTEGER NOT NULL CHECK (words_per_minute BETWEEN 50 AND 1500),
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE shelf_items (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        book_id TEXT NOT NULL REFERENCES books(id),
        saved_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, book_id)
      );
      CREATE TABLE dismissals (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        book_id TEXT NOT NULL REFERENCES books(id),
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, book_id)
      );
      CREATE INDEX idx_shelf_user_saved ON shelf_items(user_id, saved_at DESC);
    `,
  },
];

export function openDatabase(filename = ":memory:"): Db {
  const sqlite = new Database(filename);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  migrate(sqlite);
  seedCatalog(sqlite);
  return drizzle(sqlite, { schema });
}

function migrate(sqlite: Database.Database): void {
  sqlite.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");
  const applied = new Set(
    (sqlite.prepare("SELECT id FROM schema_migrations").all() as { id: string }[]).map((r) => r.id),
  );
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    sqlite.transaction(() => {
      sqlite.exec(m.sql);
      sqlite.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(m.id, Date.now());
    })();
  }
}

/** Upsert so catalog edits in code propagate on restart without touching user data. */
function seedCatalog(sqlite: Database.Database): void {
  const upsert = sqlite.prepare(`
    INSERT INTO books (id, title, author, year, pages, genres, moods, popularity_bp, blurb)
    VALUES (@id, @title, @author, @year, @pages, @genres, @moods, @popularity, @blurb)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title, author = excluded.author, year = excluded.year, pages = excluded.pages,
      genres = excluded.genres, moods = excluded.moods, popularity_bp = excluded.popularity_bp, blurb = excluded.blurb
  `);
  sqlite.transaction(() => {
    for (const b of CATALOG) {
      upsert.run({
        ...b,
        genres: JSON.stringify(b.genres),
        moods: JSON.stringify(b.moods),
        popularity: Math.round(b.popularity * 10000),
      });
    }
  })();
}
