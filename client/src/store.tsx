import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type Meta, type Preferences } from "./api";

export type Tab = "home" | "bag" | "today" | "group";

interface Store {
  email: string;
  prefs: Preferences;
  meta: Meta;
  setPrefs: (p: Preferences) => void;
  bag: string[];
  toggleBag: (id: string) => void;
  clearBag: () => void;
  tab: Tab;
  setTab: (t: Tab) => void;
  openRecipe: string | null;
  setOpenRecipe: (id: string | null) => void;
  profileOpen: boolean;
  setProfileOpen: (o: boolean) => void;
  /** Bumped whenever data changes so views refetch. */
  version: number;
  bump: () => void;
  logout: () => void;
}

const Ctx = createContext<Store | null>(null);

const BAG_KEY = "platewise.bag";
const readBag = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(BAG_KEY) ?? "[]");
  } catch {
    return [];
  }
};

export function StoreProvider({ email, prefs: initial, meta, onLogout, children }: {
  email: string; prefs: Preferences; meta: Meta; onLogout: () => void; children: ReactNode;
}) {
  const [prefs, setPrefs] = useState(initial);
  const [bag, setBag] = useState<string[]>(readBag);
  const [tab, setTab] = useState<Tab>("home");
  const [openRecipe, setOpenRecipe] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    try {
      localStorage.setItem(BAG_KEY, JSON.stringify(bag));
    } catch {
      /* ignore */
    }
  }, [bag]);

  const toggleBag = useCallback((id: string) => setBag((b) => (b.includes(id) ? b.filter((x) => x !== id) : [...b, id])), []);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const value = useMemo<Store>(
    () => ({
      email, prefs, meta, setPrefs, bag, toggleBag, clearBag: () => setBag([]), tab,
      setTab: (t) => {
        setOpenRecipe(null);
        setProfileOpen(false);
        setTab(t);
        window.scrollTo({ top: 0 });
      },
      openRecipe, setOpenRecipe, profileOpen, setProfileOpen, version, bump,
      logout: () => {
        api.logout();
        onLogout();
      },
    }),
    [email, prefs, meta, bag, toggleBag, tab, openRecipe, profileOpen, version, bump, onLogout],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside provider");
  return s;
}
