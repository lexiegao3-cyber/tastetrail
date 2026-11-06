import { and, desc, eq } from "drizzle-orm";
import type { Book } from "./catalog.js";
import type { Db } from "./db/index.js";
import { books, dismissals, preferences, shelfItems, users } from "./db/schema.js";
import { DEFAULT_WPM } from "./ranking/engine.js";

export interface Preferences {
  genres: string[];
  moods: string[];
  budgetMinutes: number | null;
  wordsPerMinute: number;
}

export const DEFAULT_PREFERENCES: Preferences = { genres: [], moods: [], budgetMinutes: null, wordsPerMinute: DEFAULT_WPM };

/** Thin data-access layer; every user-owned query is keyed by userId. */
export class Repository {
  constructor(private readonly db: Db) {}

  loadCatalog(): Book[] {
    return this.db
      .select()
      .from(books)
      .orderBy(books.id)
      .all()
      .map((r) => ({ ...r, popularity: r.popularity / 10000 }));
  }

  createUser(email: string, passwordHash: string): number | null {
    const row = this.db
      .insert(users)
      .values({ email, passwordHash, createdAt: new Date() })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id })
      .get();
    return row?.id ?? null;
  }

  findUserByEmail(email: string) {
    return this.db.select().from(users).where(eq(users.email, email)).get();
  }

  findUserById(id: number) {
    return this.db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, id)).get();
  }

  getPreferences(userId: number): Preferences {
    const row = this.db.select().from(preferences).where(eq(preferences.userId, userId)).get();
    if (!row) return DEFAULT_PREFERENCES;
    return { genres: row.genres, moods: row.moods, budgetMinutes: row.budgetMinutes, wordsPerMinute: row.wordsPerMinute };
  }

  savePreferences(userId: number, p: Preferences): Preferences {
    const values = { userId, ...p, updatedAt: new Date() };
    this.db
      .insert(preferences)
      .values(values)
      .onConflictDoUpdate({ target: preferences.userId, set: { ...p, updatedAt: values.updatedAt } })
      .run();
    return p;
  }

  shelf(userId: number): { bookId: string; savedAt: Date }[] {
    return this.db
      .select({ bookId: shelfItems.bookId, savedAt: shelfItems.savedAt })
      .from(shelfItems)
      .where(eq(shelfItems.userId, userId))
      .orderBy(desc(shelfItems.savedAt), shelfItems.bookId)
      .all();
  }

  /** Idempotent: saving an already-saved book is a no-op. Returns true if newly saved. */
  addToShelf(userId: number, bookId: string): boolean {
    const res = this.db
      .insert(shelfItems)
      .values({ userId, bookId, savedAt: new Date() })
      .onConflictDoNothing()
      .run();
    if (res.changes > 0) {
      // Saving a book overrides an earlier "not interested".
      this.db.delete(dismissals).where(and(eq(dismissals.userId, userId), eq(dismissals.bookId, bookId))).run();
    }
    return res.changes > 0;
  }

  removeFromShelf(userId: number, bookId: string): boolean {
    const res = this.db
      .delete(shelfItems)
      .where(and(eq(shelfItems.userId, userId), eq(shelfItems.bookId, bookId)))
      .run();
    return res.changes > 0;
  }

  dismissed(userId: number): string[] {
    return this.db
      .select({ bookId: dismissals.bookId })
      .from(dismissals)
      .where(eq(dismissals.userId, userId))
      .all()
      .map((r) => r.bookId);
  }

  dismiss(userId: number, bookId: string): void {
    this.db.insert(dismissals).values({ userId, bookId, createdAt: new Date() }).onConflictDoNothing().run();
  }

  undismiss(userId: number, bookId: string): void {
    this.db.delete(dismissals).where(and(eq(dismissals.userId, userId), eq(dismissals.bookId, bookId))).run();
  }
}
