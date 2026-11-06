import { useCallback, useEffect, useState } from "react";
import { api, formatMinutes, pretty, type Book, type Preferences, type Recommendation } from "./api";
import { BookCard } from "./components/BookCard";

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

  if (!ready) return null;
  if (!email || !prefs)
    return (
      <Login
        onDone={async (e) => {
          const m = await api.me();
          setPrefs(m.preferences);
          setEmail(e);
        }}
      />
    );
  return <Home email={email} initialPrefs={prefs} onLogout={() => { api.logout(); setEmail(null); }} />;
}

function Login({ onDone }: { onDone: (email: string) => Promise<void> }) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  return (
    <div className="login">
      <h1>TasteTrail</h1>
      <p>Book picks that fit your taste and the time you actually have.</p>
      <form
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
        <input type="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" placeholder="Password (8+ characters)" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="error">{error}</p>}
        <button>{mode === "register" ? "Create account" : "Sign in"}</button>
      </form>
      <button className="ghost" onClick={() => setMode(mode === "register" ? "login" : "register")}>
        {mode === "register" ? "I already have an account" : "Create a new account"}
      </button>
    </div>
  );
}

const BUDGETS = [null, 120, 240, 480, 720, 1200];

function Home({ email, initialPrefs, onLogout }: { email: string; initialPrefs: Preferences; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("discover");
  const [meta, setMeta] = useState<{ genres: string[]; moods: string[] }>({ genres: [], moods: [] });
  const [prefs, setPrefs] = useState(initialPrefs);
  const [diversity, setDiversity] = useState(0.25);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [shelf, setShelf] = useState<Book[]>([]);
  const [error, setError] = useState("");

  const loadShelf = useCallback(async () => setShelf((await api.shelf()).items.map((i) => i.book)), []);

  const loadRecs = useCallback(async () => {
    try {
      setRecs((await api.recommend({ ...prefs, diversity, limit: 8 })).items);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [prefs, diversity]);

  useEffect(() => {
    api.meta().then(setMeta);
    loadShelf();
  }, [loadShelf]);

  // Recompute as preferences change, and persist them (debounced).
  useEffect(() => {
    const t = setTimeout(() => {
      loadRecs();
      api.savePreferences(prefs).catch(() => undefined);
    }, 250);
    return () => clearTimeout(t);
  }, [prefs, loadRecs]);

  const toggle = (key: "genres" | "moods", value: string) =>
    setPrefs((p) => ({ ...p, [key]: p[key].includes(value) ? p[key].filter((x) => x !== value) : [...p[key], value] }));

  async function save(id: string) {
    await api.save(id);
    await Promise.all([loadShelf(), loadRecs()]);
  }

  return (
    <div className="app">
      <nav>
        <strong className="logo">TasteTrail</strong>
        {(["discover", "shelf", "browse"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "nav on" : "nav"} onClick={() => setTab(t)}>
            {t === "shelf" ? `My shelf (${shelf.length})` : t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
        <span className="spacer" />
        <span className="who">{email}</span>
        <button className="ghost" onClick={onLogout}>Sign out</button>
      </nav>

      {tab === "discover" && (
        <div className="discover">
          <section className="prefs">
            <h2>Your taste</h2>
            <h4>Genres</h4>
            <div className="chips">
              {meta.genres.map((g) => (
                <button key={g} className={prefs.genres.includes(g) ? "chip on" : "chip"} onClick={() => toggle("genres", g)}>{pretty(g)}</button>
              ))}
            </div>
            <h4>Mood</h4>
            <div className="chips">
              {meta.moods.map((m) => (
                <button key={m} className={prefs.moods.includes(m) ? "chip mood on" : "chip mood"} onClick={() => toggle("moods", m)}>{m}</button>
              ))}
            </div>
            <h4>Time to read</h4>
            <div className="chips">
              {BUDGETS.map((b) => (
                <button key={String(b)} className={prefs.budgetMinutes === b ? "chip on" : "chip"} onClick={() => setPrefs({ ...prefs, budgetMinutes: b })}>
                  {b === null ? "Any" : `≤ ${formatMinutes(b)}`}
                </button>
              ))}
            </div>
            <label>
              Reading speed: {prefs.wordsPerMinute} wpm
              <input type="range" min={100} max={600} step={25} value={prefs.wordsPerMinute} onChange={(e) => setPrefs({ ...prefs, wordsPerMinute: Number(e.target.value) })} />
            </label>
            <label>
              Variety: {diversity < 0.15 ? "focused" : diversity < 0.4 ? "balanced" : "exploratory"}
              <input type="range" min={0} max={0.6} step={0.05} value={diversity} onChange={(e) => setDiversity(Number(e.target.value))} />
            </label>
          </section>
          <section className="results">
            {error && <p className="error">{error}</p>}
            {recs.length === 0 && <p className="empty">Nothing fits those filters yet — try a longer time budget or another genre.</p>}
            {recs.map((r) => (
              <BookCard
                key={r.book.id}
                book={r.book}
                reasons={r.reasons}
                score={r.score}
                actions={
                  <>
                    <button onClick={() => save(r.book.id)}>Save</button>
                    <button className="ghost" onClick={async () => { await api.dismiss(r.book.id); await loadRecs(); }}>Not for me</button>
                  </>
                }
              />
            ))}
          </section>
        </div>
      )}

      {tab === "shelf" && (
        <section className="results wide">
          {shelf.length === 0 && <p className="empty">Saved books appear here and make future picks more personal.</p>}
          {shelf.map((b) => (
            <BookCard key={b.id} book={b} actions={<button className="ghost" onClick={async () => { await api.unsave(b.id); await Promise.all([loadShelf(), loadRecs()]); }}>Remove</button>} />
          ))}
        </section>
      )}

      {tab === "browse" && <Browse genres={meta.genres} shelfIds={new Set(shelf.map((b) => b.id))} onSave={save} />}
    </div>
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
    <section className="results wide">
      <div className="filters">
        <input placeholder="Search title or author" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={genre} onChange={(e) => setGenre(e.target.value)}>
          <option value="">All genres</option>
          {genres.map((g) => <option key={g} value={g}>{pretty(g)}</option>)}
        </select>
      </div>
      {books.map((b) => (
        <BookCard key={b.id} book={b} actions={shelfIds.has(b.id) ? <span className="saved">On your shelf</span> : <button onClick={() => onSave(b.id)}>Save</button>} />
      ))}
    </section>
  );
}
