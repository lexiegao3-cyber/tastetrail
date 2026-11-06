export interface Book {
  id: string;
  title: string;
  author: string;
  year: number;
  pages: number;
  genres: string[];
  moods: string[];
  blurb: string;
  readingMinutes: number;
}

export interface Reason {
  component: "genre" | "time" | "mood" | "shelf" | "popularity";
  text: string;
  contribution: number;
}

export interface Recommendation {
  book: Book;
  score: number;
  reasons: Reason[];
}

export interface Preferences {
  genres: string[];
  moods: string[];
  budgetMinutes: number | null;
  wordsPerMinute: number;
}

let token: string | null = null;
try {
  token = localStorage.getItem("tastetrail.token");
} catch {
  /* storage blocked */
}

function setToken(t: string | null) {
  token = t;
  try {
    if (t) localStorage.setItem("tastetrail.token", t);
    else localStorage.removeItem("tastetrail.token");
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) setToken(null);
    const detail = data.issues?.map((i: { path: string; message: string }) => `${i.path}: ${i.message}`).join("; ");
    throw new ApiError(res.status, detail || data.error || res.statusText);
  }
  return data as T;
}

export const api = {
  hasToken: () => token !== null,
  logout: () => setToken(null),
  async auth(mode: "login" | "register", email: string, password: string) {
    const r = await call<{ token: string; email: string }>("POST", `/api/auth/${mode}`, { email, password });
    setToken(r.token);
    return r.email;
  },
  me: () => call<{ email: string; preferences: Preferences }>("GET", "/api/me"),
  meta: () => call<{ genres: string[]; moods: string[] }>("GET", "/api/meta"),
  savePreferences: (p: Preferences) => call<Preferences>("PUT", "/api/preferences", p),
  recommend: (p: Preferences & { diversity: number; limit: number }) =>
    call<{ items: Recommendation[] }>("POST", "/api/recommendations", p),
  shelf: () => call<{ items: { book: Book; savedAt: string }[] }>("GET", "/api/shelf"),
  save: (bookId: string) => call("POST", "/api/shelf", { bookId }),
  unsave: (bookId: string) => call("DELETE", `/api/shelf/${encodeURIComponent(bookId)}`),
  dismiss: (bookId: string) => call("POST", "/api/dismissals", { bookId }),
  books: (q: string, genre: string) => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (genre) qs.set("genre", genre);
    return call<{ items: Book[] }>("GET", `/api/books?${qs}`);
  },
};

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = min / 60;
  return `${h < 10 ? h.toFixed(1).replace(/\.0$/, "") : Math.round(h)} h`;
}

export const pretty = (s: string) => s.replace(/-/g, " ");
