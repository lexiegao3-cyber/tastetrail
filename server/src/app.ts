import express from "express";
import { z } from "zod";
import { authenticate, hashPassword, issueToken, verifyPassword, type AuthConfig } from "./auth.js";
import { GENRES, MOODS, type Book } from "./catalog.js";
import type { Db } from "./db/index.js";
import { errorHandler, HttpError } from "./errors.js";
import { readingMinutes, Recommender } from "./ranking/engine.js";
import { Repository } from "./repository.js";

const credentials = z.object({
  email: z.email().max(254).transform((e) => e.toLowerCase()),
  password: z.string().min(8).max(128),
});

const genre = z.enum(GENRES);
const mood = z.enum(MOODS);

const preferencesBody = z.object({
  genres: z.array(genre).max(GENRES.length).default([]),
  moods: z.array(mood).max(MOODS.length).default([]),
  budgetMinutes: z.number().int().min(15).max(100 * 60).nullable().default(null),
  wordsPerMinute: z.number().int().min(50).max(1500).default(250),
});

const recommendBody = z.object({
  /** Overrides for this request; omitted fields fall back to saved preferences. */
  genres: z.array(genre).optional(),
  moods: z.array(mood).optional(),
  budgetMinutes: z.number().int().min(15).max(100 * 60).nullable().optional(),
  wordsPerMinute: z.number().int().min(50).max(1500).optional(),
  limit: z.number().int().min(1).max(20).default(6),
  diversity: z.number().min(0).max(1).default(0.25),
});

const bookIdBody = z.object({ bookId: z.string().min(1).max(64) });

const listQuery = z.object({
  q: z.string().max(100).optional(),
  genre: genre.optional(),
  maxMinutes: z.coerce.number().int().positive().optional(),
});

export function createApp(db: Db, authCfg: AuthConfig) {
  const repo = new Repository(db);
  const catalog = repo.loadCatalog();
  const byId = new Map(catalog.map((b) => [b.id, b]));
  const recommender = new Recommender(catalog);
  const requireAuth = authenticate(authCfg, { required: true });

  const toDto = (b: Book, wpm = 250) => ({ ...b, readingMinutes: readingMinutes(b, wpm) });
  const ensureBook = (id: string) => {
    const b = byId.get(id);
    if (!b) throw new HttpError(404, `Unknown book '${id}'`);
    return b;
  };

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));

  app.get("/api/health", (_req, res) => res.json({ status: "ok", books: catalog.length }));

  // ---- auth ---------------------------------------------------------------
  app.post("/api/auth/register", async (req, res) => {
    const { email, password } = credentials.parse(req.body);
    const id = repo.createUser(email, await hashPassword(password));
    if (id === null) throw new HttpError(409, "Email is already registered");
    res.status(201).json({ token: await issueToken(id, authCfg), email });
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = credentials.parse(req.body);
    const user = repo.findUserByEmail(email);
    const ok = user ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !ok) throw new HttpError(401, "Invalid email or password");
    res.json({ token: await issueToken(user.id, authCfg), email: user.email });
  });

  app.get("/api/me", requireAuth, (req, res) => {
    const user = repo.findUserById(req.userId!);
    if (!user) throw new HttpError(401, "Account no longer exists");
    res.json({ ...user, preferences: repo.getPreferences(user.id) });
  });

  // ---- catalog (public) -----------------------------------------------------
  app.get("/api/meta", (_req, res) => res.json({ genres: GENRES, moods: MOODS }));

  app.get("/api/books", (req, res) => {
    const { q, genre: g, maxMinutes } = listQuery.parse(req.query);
    const needle = q?.toLowerCase();
    const items = catalog
      .filter((b) => !g || b.genres.includes(g))
      .filter((b) => !needle || b.title.toLowerCase().includes(needle) || b.author.toLowerCase().includes(needle))
      .filter((b) => !maxMinutes || readingMinutes(b) <= maxMinutes)
      .map((b) => toDto(b));
    res.json({ items, total: items.length });
  });

  // ---- preferences ------------------------------------------------------------
  app.get("/api/preferences", requireAuth, (req, res) => res.json(repo.getPreferences(req.userId!)));

  app.put("/api/preferences", requireAuth, (req, res) => {
    res.json(repo.savePreferences(req.userId!, preferencesBody.parse(req.body)));
  });

  // ---- recommendations ----------------------------------------------------------
  app.post("/api/recommendations", requireAuth, (req, res) => {
    const body = recommendBody.parse(req.body ?? {});
    const saved = repo.getPreferences(req.userId!);
    const wpm = body.wordsPerMinute ?? saved.wordsPerMinute;
    const budget = body.budgetMinutes === undefined ? saved.budgetMinutes : body.budgetMinutes;
    const recs = recommender.recommend({
      genres: body.genres ?? saved.genres,
      moods: body.moods ?? saved.moods,
      budgetMinutes: budget ?? undefined,
      wordsPerMinute: wpm,
      shelf: repo.shelf(req.userId!).map((s) => s.bookId),
      dismissed: repo.dismissed(req.userId!),
      limit: body.limit,
      lambda: 1 - body.diversity,
    });
    res.json({
      items: recs.map((r) => ({
        book: toDto(r.book, wpm),
        score: r.score,
        components: r.components,
        reasons: r.reasons,
      })),
    });
  });

  // ---- shelf & feedback -----------------------------------------------------------
  app.get("/api/shelf", requireAuth, (req, res) => {
    const { wordsPerMinute } = repo.getPreferences(req.userId!);
    res.json({
      items: repo.shelf(req.userId!).map((s) => ({ savedAt: s.savedAt, book: toDto(ensureBook(s.bookId), wordsPerMinute) })),
    });
  });

  app.post("/api/shelf", requireAuth, (req, res) => {
    const { bookId } = bookIdBody.parse(req.body);
    ensureBook(bookId);
    const created = repo.addToShelf(req.userId!, bookId);
    res.status(created ? 201 : 200).json({ bookId, saved: true });
  });

  app.delete("/api/shelf/:bookId", requireAuth, (req, res) => {
    const bookId = String(req.params.bookId);
    if (!repo.removeFromShelf(req.userId!, bookId)) throw new HttpError(404, "Book is not on your shelf");
    res.status(204).end();
  });

  app.post("/api/dismissals", requireAuth, (req, res) => {
    const { bookId } = bookIdBody.parse(req.body);
    ensureBook(bookId);
    repo.dismiss(req.userId!, bookId);
    res.status(204).end();
  });

  app.delete("/api/dismissals/:bookId", requireAuth, (req, res) => {
    repo.undismiss(req.userId!, String(req.params.bookId));
    res.status(204).end();
  });

  app.use("/api", (_req, _res, next) => next(new HttpError(404, "Not found")));
  app.use(errorHandler);
  return app;
}
