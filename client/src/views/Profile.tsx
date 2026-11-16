import { useState } from "react";
import { api, type Preferences } from "../api";
import { Icon } from "../components/Icon";
import { Chips } from "../components/ui";
import { useI18n } from "../i18n";
import { useStore } from "../store";

export function ProfileView() {
  const s = useStore();
  const { t, lang, setLang } = useI18n();
  const [p, setP] = useState<Preferences>(s.prefs);
  const [status, setStatus] = useState("");
  const set = <K extends keyof Preferences>(k: K, val: Preferences[K]) => setP({ ...p, [k]: val });
  const setR = (k: keyof Preferences["restrictions"], val: string | string[]) => setP({ ...p, restrictions: { ...p.restrictions, [k]: val } });
  const m = s.meta;

  async function save() {
    setStatus("");
    try {
      const saved = await api.savePreferences(p);
      s.setPrefs(saved);
      s.bump();
      setStatus(t("profile.saved"));
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  const num = (k: "dailyKcal" | "proteinG" | "maxMinutes" | "mealBudget", min: number, max: number, step = 1) => (
    <input type="number" min={min} max={max} step={step} value={p[k]} onChange={(e) => set(k, Number(e.target.value))} />
  );

  return (
    <div className="profile">
      <div className="row between center">
        <button className="round" onClick={() => s.setProfileOpen(false)} aria-label="Back"><Icon name="back" /></button>
        <h1>{t("profile.title")}</h1>
        <span style={{ width: 44 }} />
      </div>
      <p className="muted center-text">{s.email}</p>

      <section className="card form">
        <label className="label"><Icon name="globe" size={16} /> {t("profile.language")}</label>
        <Chips options={["en", "zh"] as const} value={lang} onChange={(x) => setLang(x as "en" | "zh")} label={(o) => (o === "en" ? "English" : "中文")} />
        <label className="label">{t("profile.mode")}</label>
        <Chips options={m.modes} value={p.mode} onChange={(x) => set("mode", x as Preferences["mode"])} />
        <label className="label">{t("profile.goal")}</label>
        <Chips options={m.goals} value={p.goal} onChange={(x) => set("goal", x as string)} />
        <div className="grid2">
          <label className="field"><span>{t("profile.kcal")}</span>{num("dailyKcal", 1200, 4500, 50)}</label>
          <label className="field"><span>{t("profile.protein")}</span>{num("proteinG", 20, 300)}</label>
          <label className="field"><span>{t("profile.maxMinutes")}</span>{num("maxMinutes", 5, 120, 5)}</label>
          <label className="field"><span>{t("profile.budget")}</span>{num("mealBudget", 2, 100)}</label>
        </div>
        <label className="label">{t("profile.cuisines")}</label>
        <Chips multi options={m.cuisines} value={p.cuisines} onChange={(x) => set("cuisines", x as string[])} />
        <label className="label">{t("profile.equipment")}</label>
        <Chips multi options={m.equipment} value={p.equipment} onChange={(x) => set("equipment", x as string[])} />
      </section>

      <section className="card form">
        <label className="label">{t("profile.diet")}</label>
        <Chips options={m.diets} value={p.restrictions.diet} onChange={(x) => setR("diet", x as string)} />
        <label className="label">{t("profile.allergens")}</label>
        <Chips multi options={m.allergens} value={p.restrictions.allergens} onChange={(x) => setR("allergens", x as string[])} />
        <label className="label">{t("profile.religious")}</label>
        <Chips multi options={m.religious} value={p.restrictions.religious} onChange={(x) => setR("religious", x as string[])} />
        <label className="label">{t("profile.other")}</label>
        <Chips multi options={m.other} value={p.restrictions.other} onChange={(x) => setR("other", x as string[])} />
        <p className="small muted">{t("profile.note")}</p>
      </section>

      <section className="card form">
        <div className="grid2">
          <label className="field"><span>{t("profile.zip")}</span>
            <input inputMode="numeric" maxLength={5} value={p.zip} onChange={(e) => set("zip", e.target.value.replace(/\D/g, ""))} />
          </label>
          <label className="field"><span>{t("profile.area")}</span>
            <select value={p.area} onChange={(e) => set("area", e.target.value)}>
              {m.neighborhoods.map((n) => <option key={n.id} value={n.id}>{lang === "zh" ? n.zh : n.en}</option>)}
            </select>
          </label>
        </div>
      </section>

      <button className="btn primary wide" onClick={save}>{t("profile.save")}</button>
      {status && <p className="center-text small" role="status">{status}</p>}
      <button className="btn ghost wide" onClick={s.logout}>{t("profile.logout")}</button>
    </div>
  );
}
