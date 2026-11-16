import { useEffect, useState } from "react";
import { Header } from "../App";
import { api, type PantryItem, type RecipeDetail, type ShoppingItem } from "../api";
import { Icon } from "../components/Icon";
import { fmt, Plate, SectionHead } from "../components/ui";
import { useI18n } from "../i18n";
import { useStore } from "../store";

export function BagView() {
  const s = useStore();
  const { t, lang } = useI18n();
  const [recipes, setRecipes] = useState<RecipeDetail[]>([]);
  const [list, setList] = useState<{ items: ShoppingItem[]; estTotal: number } | null>(null);
  const [error, setError] = useState("");
  const name = (en: string, zh: string) => (lang === "zh" ? zh : en);

  useEffect(() => {
    Promise.all(s.bag.map((id) => api.recipe(id))).then(setRecipes, () => setRecipes([]));
    if (s.bag.length) api.shoppingList(s.bag).then(setList, (e) => setError(e.message));
    else setList(null);
  }, [s.bag, s.version]);

  const fullCost = recipes.reduce((sum, r) => sum + r.ingredients.reduce((a, i) => a + i.price, 0), 0);
  const covered = Math.max(0, fullCost - (list?.estTotal ?? 0));

  async function checkout(provider: "instacart" | "kroger") {
    setError("");
    const tab = window.open("", "_blank");
    try {
      const { url } = await api.checkout(s.bag, provider);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (e) {
      tab?.close();
      setError((e as Error).message);
    }
  }

  return (
    <>
      <Header title={t("bag.title")} sub={t("bag.sub")} />
      {s.bag.length === 0 && <p className="empty">{t("bag.empty")}</p>}
      <div className="list">
        {recipes.map((r) => (
          <article key={r.id} className="bag-row">
            <Plate emoji={r.emoji} cuisine={r.cuisine} size={84} />
            <div className="grow" onClick={() => s.setOpenRecipe(r.id)}>
              <h3>{name(r.title.en, r.title.zh)}</h3>
              <p className="tag-line"><Icon name="crown" size={12} /> {fmt(r.nutrition.kcal)} kcal · {r.servings}×</p>
            </div>
            <div className="bag-side">
              <b>${(r.costPerServing * r.servings).toFixed(2)}</b>
              <button className="icon-btn" aria-label="Remove" onClick={() => s.toggleBag(r.id)}><Icon name="trash" /></button>
            </div>
          </article>
        ))}
      </div>

      {s.bag.length > 0 && list && (
        <>
          <section className="card">
            <h2>{t("bag.shopping")}</h2>
            {list.items.length === 0 ? (
              <p className="muted">{t("bag.allHome")}</p>
            ) : (
              <ul className="ingredients">
                {list.items.map((i) => (
                  <li key={i.food_id}>
                    <span>{name(i.name_en, i.name_zh)}</span>
                    <span className="muted">{fmt(i.grams)} {t("bag.grams")}</span>
                    <span>${i.est_usd.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <button className="row-card" onClick={() => s.setProfileOpen(true)}>
            <Icon name="pin" />
            <span className="grow">
              <b>{t("bag.deliver")}</b>
              <small>{s.prefs.zip || t("bag.noZip")}</small>
            </span>
            <span className="accent">{t("bag.change")}</span>
          </button>
          <section className="totals">
            <div className="row between"><span>{t("bag.covered")}</span><span>−${covered.toFixed(2)}</span></div>
            <div className="row between total"><span>{t("bag.subtotal")}</span><b>${list.estTotal.toFixed(2)}</b></div>
          </section>
          {error && <p className="error">{error}</p>}
          {list.items.length > 0 && (
            <div className="stack">
              <button className="btn primary wide" onClick={() => checkout("instacart")}>{t("bag.checkoutInstacart")} <Icon name="arrow" /></button>
              <button className="btn ghost wide" onClick={() => checkout("kroger")}>{t("bag.checkoutKroger")}</button>
            </div>
          )}
        </>
      )}
      <Pantry />
    </>
  );
}

function Pantry() {
  const s = useStore();
  const { t, lang } = useI18n();
  const [items, setItems] = useState<PantryItem[]>([]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; name_en: string; name_zh: string }[]>([]);

  useEffect(() => {
    api.pantry().then((r) => setItems(r.items), () => undefined);
  }, [s.version]);
  useEffect(() => {
    if (!q.trim()) return setHits([]);
    const id = setTimeout(() => api.foods(q).then((r) => setHits(r.items), () => setHits([])), 200);
    return () => clearTimeout(id);
  }, [q]);

  return (
    <section>
      <SectionHead title={t("bag.pantry")} sub={t("bag.pantrySub")} />
      <div className="search compact">
        <Icon name="plus" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("bag.addPantry")} aria-label={t("bag.addPantry")} />
      </div>
      {hits.length > 0 && (
        <div className="chips">
          {hits.map((h) => (
            <button key={h.id} className="chip" onClick={async () => {
              await api.addPantry(h.id, 200);
              setQ("");
              s.bump();
            }}>+ {lang === "zh" ? h.name_zh : h.name_en}</button>
          ))}
        </div>
      )}
      <div className="pantry">
        {items.map((p) => (
          <div key={p.id} className={`pantry-item ${p.days_left <= 2 ? "soon" : ""}`}>
            <span>{lang === "zh" ? p.name_zh : p.name_en}</span>
            <small>{fmt(p.grams)} {t("bag.grams")} · {t("bag.daysLeft", { days: p.days_left })}</small>
            <button aria-label="Remove" onClick={async () => { await api.deletePantry(p.id); s.bump(); }}><Icon name="x" size={14} /></button>
          </div>
        ))}
      </div>
    </section>
  );
}
