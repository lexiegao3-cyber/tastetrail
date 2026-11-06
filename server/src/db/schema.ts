import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const books = sqliteTable("books", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  author: text("author").notNull(),
  year: integer("year").notNull(),
  pages: integer("pages").notNull(),
  genres: text("genres", { mode: "json" }).$type<string[]>().notNull(),
  moods: text("moods", { mode: "json" }).$type<string[]>().notNull(),
  popularity: integer("popularity_bp").notNull(), // basis points, avoids float storage drift
  blurb: text("blurb").notNull(),
});

export const preferences = sqliteTable("preferences", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  genres: text("genres", { mode: "json" }).$type<string[]>().notNull(),
  moods: text("moods", { mode: "json" }).$type<string[]>().notNull(),
  budgetMinutes: integer("budget_minutes"),
  wordsPerMinute: integer("words_per_minute").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const shelfItems = sqliteTable(
  "shelf_items",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bookId: text("book_id")
      .notNull()
      .references(() => books.id),
    savedAt: integer("saved_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.bookId] })],
);

export const dismissals = sqliteTable(
  "dismissals",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bookId: text("book_id")
      .notNull()
      .references(() => books.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.bookId] })],
);
