import { useCallback, useEffect, useState } from "react";
import { api, type Intent, type Meta, type Preferences } from "./api";
import { Icon } from "./components/Icon";
import { useI18n } from "./i18n";
import { StoreProvider, useStore, type Tab } from "./store";
import { AuthView } from "./views/Auth";
import { BagView } from "./views/Bag";
import { GroupView } from "./views/Group";
import { Handoff } from "./views/Handoff";
import { HomeView } from "./views/Home";
import { ProfileView } from "./views/Profile";
import { RecipeView } from "./views/Recipe";
import { TodayView } from "./views/Today";

export default function App() {
  const [session, setSession] = useState<{ email: string; prefs: Preferences; meta: Meta } | null>(null);
  const [checking, setChecking] = useState(api.hasToken());

  const load = useCallback(async () => {
    try {
      const [me, meta] = await Promise.all([api.me(), api.meta()]);
      setSession({ email: me.email, prefs: me.preferences, meta });
    } catch {
      setSession(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (api.hasToken()) void load();
  }, [load]);

  if (location.pathname.startsWith("/handoff/")) return <Handoff />;
  if (checking) return <div className="splash" aria-busy="true" />;
  if (!session) return <AuthView onAuthed={load} />;
  return (
    <StoreProvider email={session.email} prefs={session.prefs} meta={session.meta} onLogout={() => setSession(null)}>
      <Shell />
    </StoreProvider>
  );
}

function Shell() {
  const s = useStore();
  const { t } = useI18n();
  let view;
  if (s.profileOpen) view = <ProfileView />;
  else if (s.openRecipe) view = <RecipeView id={s.openRecipe} />;
  else if (s.tab === "home") view = <HomeView />;
  else if (s.tab === "bag") view = <BagView />;
  else if (s.tab === "today") view = <TodayView />;
  else view = <GroupView />;

  const tabs: { id: Tab; icon: string; label: string }[] = [
    { id: "home", icon: "grid", label: t("nav.home") },
    { id: "bag", icon: "bag", label: t("nav.bag") },
    { id: "today", icon: "crown", label: t("nav.today") },
    { id: "group", icon: "users", label: t("nav.group") },
  ];

  return (
    <div className="shell">
      <main className="page">{view}</main>
      <nav className="tabbar" aria-label="Main">
        {tabs.map((x) => (
          <button
            key={x.id}
            className={`tab ${s.tab === x.id && !s.openRecipe && !s.profileOpen ? "active" : ""}`}
            aria-label={x.label}
            aria-current={s.tab === x.id ? "page" : undefined}
            onClick={() => s.setTab(x.id)}
          >
            <Icon name={x.icon} size={22} />
            {x.id === "bag" && s.bag.length > 0 && <span className="dot">{s.bag.length}</span>}
          </button>
        ))}
      </nav>
      <PendingSheet />
    </div>
  );
}

/** When the user comes back from Instacart, DoorDash or Maps, ask whether it happened. */
function PendingSheet() {
  const { t, v } = useI18n();
  const s = useStore();
  const [intent, setIntent] = useState<Intent | null>(null);

  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== "visible") return;
      api.pending().then((r) => setIntent(r.items[0] ?? null), () => undefined);
    };
    check();
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, [s.version]);

  if (!intent) return null;
  const params = { provider: v(intent.provider), label: intent.payload.label ?? "" };
  const msg = intent.kind === "grocery" ? t("pending.grocery", params) : intent.kind === "takeout" ? t("pending.takeout", params) : t("pending.restaurant", params);
  const answer = async (yes: boolean) => {
    await api.resolve(intent.id, yes).catch(() => undefined);
    setIntent(null);
    if (yes && intent.kind === "grocery") s.clearBag();
    s.bump();
  };
  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="pending-title">
      <div className="sheet">
        <h3 id="pending-title">{t("pending.title")}</h3>
        <p className="muted">{msg}</p>
        <div className="row gap">
          <button className="btn ghost grow" onClick={() => answer(false)}>{t("pending.no")}</button>
          <button className="btn primary grow" onClick={() => answer(true)}>{t("pending.yes")}</button>
        </div>
      </div>
    </div>
  );
}

export function Header({ title, sub }: { title: string; sub?: string }) {
  const s = useStore();
  const { lang, setLang } = useI18n();
  const area = s.meta.neighborhoods.find((n) => n.id === s.prefs.area);
  return (
    <header className="topbar">
      <button className="who" onClick={() => s.setProfileOpen(true)} aria-label="Profile">
        <span className="avatar">{s.email[0]?.toUpperCase()}</span>
        <span className="who-text">
          <strong>{s.email.split("@")[0]}</strong>
          <small>{area ? (lang === "zh" ? area.zh : area.en) : ""}{s.prefs.zip ? ` · ${s.prefs.zip}` : ""}</small>
        </span>
      </button>
      <div className="row gap-s">
        <button className="lang" onClick={() => setLang(lang === "en" ? "zh" : "en")} aria-label="Switch language">
          {lang === "en" ? "中文" : "EN"}
        </button>
        <button className="bag-tag" onClick={() => s.setTab("bag")} aria-label="Bag">
          <Icon name="bag" size={18} />
          <span><b>{s.bag.length}</b><br />{lang === "zh" ? "道菜" : s.bag.length === 1 ? "Recipe" : "Recipes"}</span>
        </button>
      </div>
      <div className="title-block">
        <h1>{title}</h1>
        {sub && <p className="accent-sub">{sub}</p>}
      </div>
    </header>
  );
}
