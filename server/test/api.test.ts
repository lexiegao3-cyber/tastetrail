import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db/index.js";

const authCfg = { secret: new TextEncoder().encode("test-secret-test-secret-test-secret"), ttlSeconds: 60 };
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  app = createApp(openDatabase(":memory:"), authCfg);
});

async function signUp(email = "reader@example.com") {
  const res = await request(app).post("/api/auth/register").send({ email, password: "long-enough" }).expect(201);
  return { Authorization: `Bearer ${res.body.token}` };
}

describe("API", () => {
  it("registers, rejects duplicates and bad credentials", async () => {
    await signUp();
    await request(app).post("/api/auth/register").send({ email: "READER@example.com", password: "long-enough" }).expect(409);
    await request(app).post("/api/auth/login").send({ email: "reader@example.com", password: "wrong-pass" }).expect(401);
    await request(app).post("/api/auth/login").send({ email: "reader@example.com", password: "long-enough" }).expect(200);
    await request(app).get("/api/shelf").expect(401);
    await request(app).get("/api/shelf").set("Authorization", "Bearer nope").expect(401);
  });

  it("validates input with field-level errors", async () => {
    const h = await signUp();
    const res = await request(app).put("/api/preferences").set(h).send({ genres: ["poetry"], wordsPerMinute: 5 }).expect(400);
    expect(res.body.issues.map((i: { path: string }) => i.path).sort()).toEqual(["genres.0", "wordsPerMinute"]);
  });

  it("persists preferences and uses them when the request omits overrides", async () => {
    const h = await signUp();
    await request(app).put("/api/preferences").set(h).send({ genres: ["horror"], budgetMinutes: 600 }).expect(200);
    const res = await request(app).post("/api/recommendations").set(h).send({}).expect(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const item of res.body.items) expect(item.book.genres).toContain("horror");
    expect(res.body.items[0].reasons[0].text).toMatch(/horror/);
  });

  it("shelf writes are idempotent and saved books leave recommendations", async () => {
    const h = await signUp();
    const first = await request(app).post("/api/recommendations").set(h).send({ genres: ["mystery"], limit: 3 });
    const topId = first.body.items[0].book.id;

    await request(app).post("/api/shelf").set(h).send({ bookId: topId }).expect(201);
    await request(app).post("/api/shelf").set(h).send({ bookId: topId }).expect(200);
    const shelf = await request(app).get("/api/shelf").set(h).expect(200);
    expect(shelf.body.items.map((i: { book: { id: string } }) => i.book.id)).toEqual([topId]);

    const after = await request(app).post("/api/recommendations").set(h).send({ genres: ["mystery"], limit: 10 });
    expect(after.body.items.map((i: { book: { id: string } }) => i.book.id)).not.toContain(topId);

    await request(app).delete(`/api/shelf/${topId}`).set(h).expect(204);
    await request(app).delete(`/api/shelf/${topId}`).set(h).expect(404);
    await request(app).post("/api/shelf").set(h).send({ bookId: "not-a-book" }).expect(404);
  });

  it("dismissed books are excluded and shelves are private per user", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    await request(app).post("/api/dismissals").set(alice).send({ bookId: "gone-girl" }).expect(204);
    await request(app).post("/api/shelf").set(alice).send({ bookId: "dune" }).expect(201);

    const recs = await request(app).post("/api/recommendations").set(alice).send({ genres: ["thriller"], limit: 10 });
    expect(recs.body.items.map((i: { book: { id: string } }) => i.book.id)).not.toContain("gone-girl");

    const bobShelf = await request(app).get("/api/shelf").set(bob).expect(200);
    expect(bobShelf.body.items).toEqual([]);
  });

  it("serves the public catalog with filters", async () => {
    const res = await request(app).get("/api/books").query({ genre: "memoir", maxMinutes: 400 }).expect(200);
    expect(res.body.items.map((b: { id: string }) => b.id).sort()).toEqual(["educated", "mans-search", "when-breath"]);
    await request(app).get("/api/books").query({ genre: "nope" }).expect(400);
  });
});
