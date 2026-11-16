import { useState } from "react";
import { Header } from "../App";
import { api, type GroupResult, type Participant } from "../api";
import { Icon } from "../components/Icon";
import { Chips, useReason } from "../components/ui";
import { useI18n } from "../i18n";
import { useStore } from "../store";

const BUDGETS: Record<string, [number, number]> = { "$15–25": [15, 25], "$25–50": [25, 50], "$50+": [50, 150] };

export function GroupView() {
  const s = useStore();
  const { t, v, lang } = useI18n();
  const reason = useReason();
  const hoods = s.meta.neighborhoods;
  const origin = (id: string) => {
    const n = hoods.find((h) => h.id === id) ?? hoods[0]!;
    return { lat: n.lat, lng: n.lng };
  };
  const me: Participant & { area: string } = {
    name: s.email.split("@")[0]!, area: s.prefs.area, origin: origin(s.prefs.area), likes: [], avoids: [], restrictions: s.prefs.restrictions,
  };
  const [people, setPeople] = useState<(Participant & { area: string })[]>([me, { ...me, name: lang === "zh" ? "朋友" : "Friend", area: "cambridge", origin: origin("cambridge"), restrictions: { diet: "none", allergens: [], religious: [], other: [] } }]);
  const [size, setSize] = useState(6);
  const [theme, setTheme] = useState("birthday");
  const [cuisine, setCuisine] = useState("hotpot");
  const [budget, setBudget] = useState("$25–50");
  const [hour, setHour] = useState(19);
  const [travel, setTravel] = useState(30);
  const [results, setResults] = useState<GroupResult[] | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const update = (i: number, patch: Partial<Participant & { area: string }>) =>
    setPeople((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch, ...(patch.area ? { origin: origin(patch.area) } : {}) } : p)));

  async function find() {
    setError("");
    try {
      const r = await api.group({
        partySize: size, theme, cuisine: cuisine === "any" ? undefined : cuisine, budget: BUDGETS[budget], hour, maxTravelMinutes: travel,
        participants: people.map(({ area: _a, ...p }) => p),
      });
      setResults(r.items);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function share() {
    const text = (results ?? []).map((r, i) => `${i + 1}. ${r.restaurant.name} · ${v(r.restaurant.cuisine)} · $${r.restaurant.price_min}–${r.restaurant.price_max} · ${r.mapsUrl}`).join("\n");
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <>
      <Header title={t("group.title")} sub={t("group.sub")} />
      <section className="card form">
        <div className="row between center">
          <label className="label">{t("group.size")}</label>
          <div className="stepper">
            <button aria-label="−" onClick={() => setSize(Math.max(2, size - 1))}><Icon name="minus" size={16} /></button>
            <b>{size}</b>
            <button aria-label="+" onClick={() => setSize(Math.min(30, size + 1))}><Icon name="plus" size={16} /></button>
          </div>
        </div>
        <label className="label">{t("group.theme")}</label>
        <Chips options={s.meta.themes} value={theme} onChange={(x) => setTheme(x as string)} />
        <label className="label">{t("group.cuisine")}</label>
        <Chips options={["any", ...s.meta.restaurantCuisines]} value={cuisine} onChange={(x) => setCuisine(x as string)} label={(o) => (o === "any" ? t("group.anyCuisine") : v(o))} />
        <label className="label">{t("group.budget")}</label>
        <Chips options={Object.keys(BUDGETS)} value={budget} onChange={(x) => setBudget(x as string)} label={(o) => o} />
        <div className="row gap">
          <label className="field grow">
            <span>{t("group.time")}</span>
            <select value={hour} onChange={(e) => setHour(Number(e.target.value))}>
              {[11, 12, 13, 17, 18, 19, 20, 21].map((h) => <option key={h} value={h}>{`${h}:00`}</option>)}
            </select>
          </label>
          <label className="field grow">
            <span>{t("group.travel")}: {t("group.minutes", { n: travel })}</span>
            <input type="range" min={10} max={60} step={5} value={travel} onChange={(e) => setTravel(Number(e.target.value))} />
          </label>
        </div>

        <div className="row between center">
          <label className="label">{t("group.who")}</label>
          <button className="link" onClick={() => setPeople([...people, { ...people[1]!, name: `${lang === "zh" ? "朋友" : "Friend"} ${people.length}` }])}>+ {t("group.addPerson")}</button>
        </div>
        {people.map((p, i) => (
          <div key={i} className="person">
            <input value={p.name} onChange={(e) => update(i, { name: e.target.value })} aria-label="Name" />
            <select value={p.area} onChange={(e) => update(i, { area: e.target.value })} aria-label={t("group.from")}>
              {hoods.map((h) => <option key={h.id} value={h.id}>{lang === "zh" ? h.zh : h.en}</option>)}
            </select>
            <select value={p.restrictions.diet} onChange={(e) => update(i, { restrictions: { ...p.restrictions, diet: e.target.value } })} aria-label={t("group.diet")}>
              {s.meta.diets.map((d) => <option key={d} value={d}>{v(d)}</option>)}
            </select>
            {i > 0 && <button className="icon-btn" aria-label="Remove" onClick={() => setPeople(people.filter((_, j) => j !== i))}><Icon name="x" size={16} /></button>}
          </div>
        ))}
        <button className="btn primary wide" onClick={find}>{t("group.find")} <Icon name="arrow" /></button>
        {error && <p className="error">{error}</p>}
      </section>

      {results && (
        <section>
          <div className="section-head">
            <div>
              <h2>{t("group.results")}</h2>
              <p className="muted small">{t("group.demo")}</p>
            </div>
            {results.length > 0 && <button className="link" onClick={share}><Icon name="copy" size={16} /> {copied ? t("group.copied") : t("group.share")}</button>}
          </div>
          {results.length === 0 && <p className="empty">{t("group.none")}</p>}
          <div className="list">
            {results.map((r, i) => (
              <article key={r.restaurant.id} className="venue">
                <div className="venue-head">
                  <span className="rank">{i + 1}</span>
                  <div className="grow">
                    <h3>{r.restaurant.name}</h3>
                    <p className="tag-line"><Icon name="crown" size={12} /> {v(r.restaurant.cuisine)} · ${r.restaurant.price_min}–{r.restaurant.price_max} · ★ {r.restaurant.rating}</p>
                  </div>
                </div>
                <ul className="reasons compact">
                  {r.reasons.slice(0, 3).map((x, j) => <li key={j}><span>{reason(x)}</span></li>)}
                  {r.warnings.map((w) => <li key={w} className="warning"><span>{reason({ code: w }, "w.")}</span></li>)}
                </ul>
                <div className="travel">
                  {r.travel.map((x) => <span key={x.name} className="badge">{x.name} · {t("group.minutes", { n: x.minutes })}</span>)}
                </div>
                <div className="row gap">
                  <button className="btn primary grow" onClick={async () => {
                    const tab = window.open("", "_blank");
                    const { url } = await api.visit(r.restaurant.id, r.restaurant.name);
                    if (tab) tab.location.href = url;
                  }}><Icon name="map" size={18} /> {t("group.maps")}</button>
                  <a className="btn ghost" href={`tel:${r.restaurant.phone.replace(/[^\d+]/g, "")}`}><Icon name="phone" size={18} /> {r.restaurant.phone}</a>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
