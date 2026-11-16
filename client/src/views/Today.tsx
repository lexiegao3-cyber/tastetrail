import { useEffect, useState, type FormEvent } from "react";
import { Header } from "../App";
import { api, type DayLog, type Recipe } from "../api";
import { Icon } from "../components/Icon";
import { fmt, Plate, SectionHead } from "../components/ui";
import { useI18n } from "../i18n";
import { useStore } from "../store";

export function TodayView() {
  const s = useStore();
  const { t, v, lang } = useI18n();
  const [log, setLog] = useState<DayLog | null>(null);
  const [plan, setPlan] = useState<{ slot: string; recipe: Recipe }[] | null>(null);
  const [label, setLabel] = useState("");
  const [kcal, setKcal] = useState("");

  useEffect(() => {
    api.dayLog().then(setLog, () => undefined);
  }, [s.version]);

  if (!log) return <div className="splash" aria-busy="true" />;
  const pct = Math.min(1, log.totals.kcal / log.targets.kcal);
  const diff = log.targets.kcal - log.totals.kcal;

  async function quick(e: FormEvent) {
    e.preventDefault();
    if (!label || !kcal) return;
    await api.logManual(label, Number(kcal), "takeout");
    setLabel("");
    setKcal("");
    s.bump();
  }

  return (
    <>
      <Header title={t("today.title")} sub={t("today.sub")} />
      <section className="club">
        <p className="kicker"><Icon name="crown" size={18} /> {v(s.prefs.goal).toUpperCase()} · {v(s.prefs.mode)}</p>
        <div className="club-row">
          <div>
            <p className="accent small">{t("today.kcal").toUpperCase()}</p>
            <p className="points"><b>{fmt(log.totals.kcal)}</b> <span>/ {fmt(log.targets.kcal)}</span></p>
          </div>
          <button className="pill-outline accent" onClick={async () => setPlan((await api.mealPlan()).items)}>
            <Icon name="box" size={18} /> {t("today.plan")}
          </button>
        </div>
        <div className="bar"><i style={{ width: `${pct * 100}%` }} /></div>
        <p className="small muted">{diff >= 0 ? t("today.kcalLeft", { kcal: fmt(diff) }) : t("today.over", { kcal: fmt(-diff) })}</p>
      </section>

      <div className="benefits">
        {[
          ["flame", `${Math.round(log.totals.protein)} / ${log.targets.protein} g`, t("detail.protein")],
          ["box", `${Math.round(log.totals.carbs)} g`, t("detail.carbs")],
          ["heart", `${Math.round(log.totals.fat)} g`, t("detail.fat")],
          ["clock", `${fmt(log.totals.sodium_mg)} mg`, t("detail.sodium")],
        ].map(([icon, val, k]) => (
          <div key={k} className="benefit">
            <span className="benefit-icon"><Icon name={icon!} size={20} /></span>
            <b>{val}</b>
            <small>{k}</small>
          </div>
        ))}
      </div>

      {plan && (
        <section>
          <SectionHead title={t("today.plan")} sub={t("today.planSub", { kcal: fmt(s.prefs.dailyKcal) })} />
          <div className="offers-grid">
            {plan.map((p) => (
              <article key={p.slot} className="offer-tile" onClick={() => s.setOpenRecipe(p.recipe.id)}>
                <div className="tile-art"><Plate emoji={p.recipe.emoji} cuisine={p.recipe.cuisine} size={78} /></div>
                <h3>{lang === "zh" ? p.recipe.title.zh : p.recipe.title.en}</h3>
                <small className="muted">{t(`today.${p.slot}` as "today.lunch")}</small>
                <div className="row between center">
                  <span className="accent">{fmt(p.recipe.nutrition.kcal)} kcal</span>
                  <button className="add small" aria-label={t("card.add")} onClick={(e) => { e.stopPropagation(); s.toggleBag(p.recipe.id); }}>
                    <Icon name={s.bag.includes(p.recipe.id) ? "check" : "plus"} size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHead title={t("today.meals")} />
        {log.items.length === 0 && <p className="muted">{t("today.noMeals")}</p>}
        <div className="list">
          {log.items.map((m) => (
            <article key={m.id} className="offer slim">
              <span className="emoji-dot">{m.emoji ?? "🥡"}</span>
              <div className="grow">
                <h3>{lang === "zh" && m.title_zh ? m.title_zh : m.label}</h3>
                <p className="tag-line">{Math.round(m.protein)} g {t("detail.protein")}</p>
              </div>
              <b>{fmt(m.kcal)} kcal</b>
              <button className="icon-btn" aria-label="Delete" onClick={async () => { await api.deleteLog(m.id); s.bump(); }}><Icon name="trash" /></button>
            </article>
          ))}
        </div>
        <form className="quick" onSubmit={quick}>
          <p className="small muted">{t("today.quick")}</p>
          <div className="row gap">
            <input className="grow" placeholder={t("today.label")} value={label} onChange={(e) => setLabel(e.target.value)} aria-label={t("today.label")} />
            <input className="kcal-in" type="number" min={0} max={5000} placeholder="kcal" value={kcal} onChange={(e) => setKcal(e.target.value)} aria-label="kcal" />
            <button className="btn primary">{t("today.log")}</button>
          </div>
        </form>
      </section>
    </>
  );
}
