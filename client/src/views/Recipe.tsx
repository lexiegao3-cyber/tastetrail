import { useEffect, useState } from "react";
import { api, type Recommendation, type RecipeDetail } from "../api";
import { Icon } from "../components/Icon";
import { fmt, Plate, useReason } from "../components/ui";
import { useI18n } from "../i18n";
import { useStore } from "../store";

export function RecipeView({ id }: { id: string }) {
  const s = useStore();
  const { t, v, lang } = useI18n();
  const reason = useReason();
  const [r, setR] = useState<RecipeDetail | null>(null);
  const [why, setWhy] = useState<Recommendation | null>(null);
  const [toast, setToast] = useState("");
  const [showInfo, setShowInfo] = useState(true);

  useEffect(() => {
    api.recipe(id).then(setR, () => setR(null));
    api.recommend({ limit: 30 }).then((x) => setWhy(x.items.find((i) => i.recipe.id === id) ?? null), () => undefined);
  }, [id, s.version]);

  if (!r) return <div className="splash" aria-busy="true" />;
  const n = r.nutrition;
  const inBag = s.bag.includes(r.id);
  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 1800);
  };
  const name = (en: string, zh: string) => (lang === "zh" ? zh : en);
  const proteinPct = Math.min(1, n.protein / Math.max(1, s.prefs.proteinG / 3));

  return (
    <article className="detail">
      <div className="detail-hero">
        <button className="round" onClick={() => s.setOpenRecipe(null)} aria-label="Back"><Icon name="back" /></button>
        <button className={`round ${r.saved ? "on" : ""}`} aria-pressed={r.saved} aria-label={r.saved ? t("detail.saved") : t("detail.save")}
          onClick={async () => { await (r.saved ? api.unsave(r.id) : api.interact(r.id, "save")); s.bump(); }}>
          <Icon name="heart" filled={r.saved} />
        </button>
        <div className="hero-plate-big"><Plate emoji={r.emoji} cuisine={r.cuisine} size={220} /></div>
        <p className="kicker"><Icon name="crown" size={16} /> {v(r.cuisine).toUpperCase()}</p>
        <h1 className="detail-title">{name(r.title.en, r.title.zh)}</h1>
        <p className="detail-sub">{lang === "zh" ? r.title.en : r.title.zh}</p>
        <button className="pill-outline" onClick={() => setShowInfo(!showInfo)} aria-expanded={showInfo}>
          <Icon name="book" size={18} /> {t("detail.information")}
        </button>
        <div className="dial">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="52" className="dial-track" />
            <circle cx="60" cy="60" r="52" className="dial-fill" style={{ strokeDasharray: `${proteinPct * 327} 327` }} />
          </svg>
          <div className="dial-center"><b>{Math.round(n.protein)}</b><small>g {t("detail.protein")}</small></div>
        </div>
        <div className="big-number">
          <b>{fmt(n.kcal)}</b><span>kcal</span>
          <small>{t("detail.steps", { steps: r.steps ?? 0, minutes: r.minutes, servings: r.servings })}</small>
        </div>
      </div>

      {showInfo && (
        <div className="detail-body">
          <div className="macro-row">
            {[
              [t("detail.carbs"), `${Math.round(n.carbs)} g`],
              [t("detail.fat"), `${Math.round(n.fat)} g`],
              [t("detail.sugar"), `${Math.round(n.sugar)} g`],
              [t("detail.sodium"), `${fmt(n.sodiumMg)} mg`],
            ].map(([k, val]) => (
              <div key={k} className="macro"><b>{val}</b><small>{k}</small></div>
            ))}
          </div>

          {why && (
            <section className="card">
              <h2>{t("detail.why")}</h2>
              <ul className="reasons">
                {why.reasons.slice(0, 5).map((x, i) => (
                  <li key={i} className={x.factor}>
                    <span>{reason(x)}</span>
                    {x.weight > 0 && <i style={{ width: `${Math.min(100, x.weight * 300)}%` }} />}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card">
            <h2>{t("detail.ingredients")}</h2>
            <ul className="ingredients">
              {r.ingredients.map((i) => {
                const have = i.have_grams >= i.grams * 0.5;
                return (
                  <li key={i.food_id}>
                    <span>{name(i.name_en, i.name_zh)}</span>
                    <span className="muted">{r.quantitiesEstimated ? "~" : ""}{Math.round(i.grams / r.servings)} g</span>
                    <span className={`badge ${have ? "ok" : ""}`}>{have ? t("detail.have") : t("detail.need")}</span>
                  </li>
                );
              })}
            </ul>
            {r.quantitiesEstimated && <p className="small muted">{t("detail.estimated")}</p>}
          </section>

          <div className="actions">
            <button className="btn ghost" onClick={async () => { await api.logRecipe(r.id); s.bump(); flash(t("detail.logged")); }}>
              <Icon name="check" size={18} /> {t("detail.cooked")}
            </button>
            <button className="btn primary" onClick={() => s.toggleBag(r.id)}>
              <Icon name={inBag ? "check" : "bag"} size={18} /> {inBag ? t("card.added") : t("detail.addBag")}
            </button>
          </div>
          <div className="takeout">
            <span className="muted small">{t("detail.orderInstead")}</span>
            {(["doordash", "ubereats"] as const).map((p) => (
              <button key={p} className="btn small ghost" onClick={async () => {
                const { url } = await api.takeout(p, r.title.en);
                window.open(url, "_blank", "noopener");
              }}>{v(p)}</button>
            ))}
            <button className="btn small ghost" onClick={async () => { await api.interact(r.id, "dismiss"); s.bump(); s.setOpenRecipe(null); }}>{t("detail.notFor")}</button>
          </div>
        </div>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </article>
  );
}
