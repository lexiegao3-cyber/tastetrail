import { MotionConfig } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, formatMinutes, pretty, type Book, type Preferences, type Recommendation } from "./api";
import { BookDetail } from "./components/BookDetail";
import { Shelf } from "./components/Shelf";

type Tab = "discover" | "shelf" | "browse";

export default function App() {
  const [email, setEmail] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [ready, setReady] = useState(!api.hasToken());

  useEffect(() => {
    if (!api.hasToken()) return;
    api
      .me()
      .then((m) => {
        setEmail(m.email);
        setPrefs(m.preferences);
      })
      .catch(() => api.logout())
      .finally(() => setReady(true));
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      {!ready ? null : !email || !prefs ? (
        <Landing
          onDone={async (e) => {
            const m = await api.me();
            setPrefs(m.preferences);
            setEmail(e);
          }}
        />
      ) : (
        <Home email={email} initialPrefs={prefs} onLogout={() => { api.logout(); setEmail(null); }} />
      )}
    </MotionConfig>
  );
}

const LANDING_PICKS = ["earthsea", "hail-mary", "piranesi", "roger-ackroyd", "educated", "dune", "murderbot", "remains-day", "circe", "mans-search", "three-body", "big-sleep"];

function Landing({ onDone }: { onDone: (email: string) => Promise<void> }) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [books, setBooks] = useState<Book[]>([]);

  useEffect(() => {
    api.books("", "").then((r) => {
      const byId = new Map(r.items.map((b) => [b.id, b]));
      setBooks(LANDING_PICKS.map((id) => byId.get(id)).filter((b): b is Book => !!b));
    });
  }, []);

  return (
    <div className="landing">
      <header className="landing-head">
        <span className="wordmark">TasteTrail</span>
      </header>
      <section className="landing-hero">
        <h1>Books that fit the evening you actually have.</h1>
        <p className="lede">
          Tell TasteTrail what you like and how long you have to read. Every pick says why it was chosen, and the
          shelf learns from what you keep.
        </p>
      </section>
      {books.length > 0 && <Shelf books={books} entrance label="A sample shelf" />}
      <p className="shelf-legend">Spine width shows reading time: the thin ones are an afternoon, the wide ones a fortnight.</p>
      <form
        className="auth"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            await onDone(await api.auth(mode, email, password));
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        }}
      >
        <label>Email<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button className="primary">{mode === "register" ? "Start my shelf" : "Sign in"}</button>
        <button type="button" className="quiet" onClick={() => setMode(mode === "register" ? "login" : "register")}>
          {mode === "register" ? "I already have an account" : "Create a new account"}
        </button>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </div>
  );
}

const BUDGETS = [null, 120, 240, 480, 720, 1200];

function describe(p: Preferences): string {
  const parts: string[] = [];
  parts.push(p.genres.length ? p.genres.map(pretty).join(", ") : "any genre");
  if (p.moods.length) parts.push(`feeling ${p.moods.join(" or ")}`);
  if (p.budgetMinutes) parts.push(`under ${formatMinutes(p.budgetMinutes)}`);
  return parts.join(", ");
}

function Home({ email, initialPrefs, onLogout }: { email: string; initialPrefs: Preferences; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("discover");
  const [meta, setMeta] = useState<{ genres: string[]; moods: string[] }>({ genres: [], moods: [] });
  const [prefs, setPrefs] = useState(initialPrefs);
  const [diversity, setDiversity] = useState(0.25);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [shelf, setShelf] = useState<Book[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadShelf = useCallback(async () => setShelf((await api.shelf()).items.map((i) => i.book)), []);
  const loadRecs = useCallback(async () => {
    try {
      const items = (await api.recommend({ ...prefs, diversity, limit: 10 })).items;
      setRecs(items);
      setSelected((cur) => (cur && items.some((r) => r.book.id === cur) ? cur : items[0]?.book.id ?? null));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [prefs, diversity]);

  useEffect(() => {
    api.meta().then(setMeta);
    loadShelf();
  }, [loadShelf]);

  useEffect(() => {
    const t = setTimeout(() => {
      loadRecs();
      api.savePreferences(prefs).catch(() => undefined);
    }, 250);
    return () => clearTimeout(t);
  }, [prefs, loadRecs]);

  const toggle = (key: "genres" | "moods", value: string) =>
    setPrefs((p) => ({ ...p, [key]: p[key].includes(value) ? p[key].filter((x) => x !== value) : [...p[key], value] }));

  const current = useMemo(() => recs.find((r) => r.book.id === selected) ?? null, [recs, selected]);

  async function save(id: string) {
    await api.save(id);
    await Promise.all([loadShelf(), loadRecs()]);
  }

  return (
    <div className="app">
      <nav>
        <span className="wordmark">TasteTrail</span>
        <div className="tabs" role="tablist">
          {(["discover", "shelf", "browse"] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "tab on" : "tab"} onClick={() => setTab(t)}>
              {t === "discover" ? "Picks for you" : t === "shelf" ? `Saved (${shelf.length})` : "Whole catalog"}
            </button>
          ))}
        </div>
        <span className="who">{email}</span>
        <button className="quiet" onClick={onLogout}>Sign out</button>
      </nav>

      {tab === "discover" && (
        <>
          <section className="shelf-band">
            <p className="for">Picks for {describe(prefs)}</p>
            {recs.length > 0 ? (
              <Shelf books={recs.map((r) => r.book)} selectedId={selected} onSelect={(b) => setSelected(b.id)} label="Recommended books, best match first" />
            ) : (
              <p className="empty">Nothing on the catalog fits all of that. Try a longer time budget or one more genre.</p>
            )}
            {error && <p className="error">{error}</p>}
          </section>
          <div className="below">
            <section className="taste">
              <h2>Your taste</h2>
              <fieldset>
                <legend>Genres</legend>
                <div className="chips">
                  {meta.genres.map((g) => (
                    <button key={g} aria-pressed={prefs.genres.includes(g)} className="chip" onClick={() => toggle("genres", g)}>{pretty(g)}</button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>Mood</legend>
                <div className="chips">
                  {meta.moods.map((m) => (
                    <button key={m} aria-pressed={prefs.moods.includes(m)} className="chip" onClick={() => toggle("moods", m)}>{m}</button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>Time to finish it</legend>
                <div className="chips">
                  {BUDGETS.map((b) => (
                    <button key={String(b)} aria-pressed={prefs.budgetMinutes === b} className="chip" onClick={() => setPrefs({ ...prefs, budgetMinutes: b })}>
                      {b === null ? "No limit" : `Up to ${formatMinutes(b)}`}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="slider">
                <span>Reading speed <b>{prefs.wordsPerMinute} words a minute</b></span>
                <input type="range" min={100} max={600} step={25} value={prefs.wordsPerMinute} onChange={(e) => setPrefs({ ...prefs, wordsPerMinute: Number(e.target.value) })} />
              </label>
              <label className="slider">
                <span>Variety <b>{diversity < 0.15 ? "close to my taste" : diversity < 0.4 ? "a little mixed" : "surprise me"}</b></span>
                <input type="range" min={0} max={0.6} step={0.05} value={diversity} onChange={(e) => setDiversity(Number(e.target.value))} />
              </label>
            </section>
            <BookDetail
              book={current?.book ?? null}
              reasons={current?.reasons}
              score={current?.score}
              empty={<p>Pick a spine on the shelf to see why it was chosen.</p>}
              actions={
                current && (
                  <>
                    <button className="primary" onClick={() => save(current.book.id)}>Save to my shelf</button>
                    <button className="quiet" onClick={async () => { await api.dismiss(current.book.id); await loadRecs(); }}>Not for me</button>
                  </>
                )
              }
            />
          </div>
        </>
      )}

      {tab === "shelf" && <SavedShelf shelf={shelf} onRemove={async (id) => { await api.unsave(id); await Promise.all([loadShelf(), loadRecs()]); }} />}
      {tab === "browse" && <Browse genres={meta.genres} shelfIds={new Set(shelf.map((b) => b.id))} onSave={save} />}
    </div>
  );
}

function SavedShelf({ shelf, onRemove }: { shelf: Book[]; onRemove: (id: string) => Promise<void> }) {
  const [selected, setSelected] = useState<string | null>(shelf[0]?.id ?? null);
  const book = shelf.find((b) => b.id === selected) ?? null;
  const total = shelf.reduce((s, b) => s + b.readingMinutes, 0);
  return (
    <>
      <section className="shelf-band">
        <p className="for">{shelf.length ? `Saved for later, about ${formatMinutes(total)} of reading` : "Nothing saved yet"}</p>
        {shelf.length > 0 && <Shelf books={shelf} selectedId={selected} onSelect={(b) => setSelected(b.id)} label="Saved books" />}
      </section>
      <div className="below single">
        <BookDetail
          book={book}
          empty={<p>Books you save land here, and they make your next picks more personal.</p>}
          actions={book && <button className="quiet" onClick={() => onRemove(book.id)}>Remove from shelf</button>}
        />
      </div>
    </>
  );
}

function Browse({ genres, shelfIds, onSave }: { genres: string[]; shelfIds: Set<string>; onSave: (id: string) => Promise<void> }) {
  const [q, setQ] = useState("");
  const [genre, setGenre] = useState("");
  const [books, setBooks] = useState<Book[]>([]);
  useEffect(() => {
    const t = setTimeout(() => api.books(q, genre).then((r) => setBooks(r.items)), 200);
    return () => clearTimeout(t);
  }, [q, genre]);
  return (
    <section className="catalog">
      <div className="filters">
        <input aria-label="Search title or author" placeholder="Search title or author" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Genre" value={genre} onChange={(e) => setGenre(e.target.value)}>
          <option value="">All genres</option>
          {genres.map((g) => <option key={g} value={g}>{pretty(g)}</option>)}
        </select>
      </div>
      <table>
        <thead>
          <tr><th>Title</th><th>Author</th><th>Reading time</th><th>Genres</th><th /></tr>
        </thead>
        <tbody>
          {books.map((b) => (
            <tr key={b.id}>
              <td><span className={`swatch g-${b.genres[0]}`} />{b.title}</td>
              <td>{b.author}</td>
              <td>{formatMinutes(b.readingMinutes)}</td>
              <td>{b.genres.map(pretty).join(", ")}</td>
              <td>{shelfIds.has(b.id) ? <span className="saved">Saved</span> : <button className="quiet" onClick={() => onSave(b.id)}>Save</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
