import { useEffect, useState } from "react";
import { api, type Poll as PollData } from "../api";
import { Icon } from "../components/Icon";
import { useI18n } from "../i18n";

const NAME_KEY = "platewise.voter";

/** Public page for a group vote: anyone with the link can pick a restaurant, no account needed. */
export function Poll() {
  const { t, v, lang, setLang } = useI18n();
  const token = location.pathname.split("/")[2] ?? "";
  const [poll, setPoll] = useState<PollData | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(NAME_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const load = () => api.poll(token).then(setPoll, (e) => setError((e as Error).message));
  useEffect(() => {
    void load();
  }, []);

  async function vote(optionId: string) {
    if (!name.trim()) return setError(t("poll.nameFirst"));
    setError("");
    try {
      localStorage.setItem(NAME_KEY, name.trim());
    } catch {
      /* private mode: the name just isn't remembered */
    }
    try {
      await api.vote(token, name.trim(), optionId);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const total = poll?.options.reduce((s, o) => s + o.voters.length, 0) ?? 0;
  const mine = poll?.options.find((o) => o.voters.includes(name.trim()))?.id;
  return (
    <div className="handoff poll">
      <div className="row between center">
        <span className="wordmark">PlateWise</span>
        <button className="lang" onClick={() => setLang(lang === "en" ? "zh" : "en")}>{lang === "en" ? "中文" : "EN"}</button>
      </div>
      <p className="kicker">{t("poll.kicker")}</p>
      <h1>{poll?.title ?? "…"}</h1>
      {error && <p className="error" role="alert">{error}</p>}
      {poll && (
        <>
          <label className="field">
            <span>{t("poll.yourName")}</span>
            <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={t("poll.namePlaceholder")} />
          </label>
          <div className="list single">
            {poll.options.map((o) => {
              const share = total ? o.voters.length / total : 0;
              return (
                <article key={o.id} className={`venue ${mine === o.id ? "picked" : ""}`}>
                  <div className="venue-head">
                    <div className="grow">
                      <h3>{o.name}</h3>
                      <p className="tag-line"><Icon name="crown" size={12} /> {v(o.cuisine)} · ${o.priceMin}–{o.priceMax}</p>
                    </div>
                    <b className="votes">{o.voters.length}</b>
                  </div>
                  <div className="bar"><i style={{ width: `${share * 100}%` }} /></div>
                  {o.voters.length > 0 && <p className="small muted">{o.voters.join(", ")}</p>}
                  <div className="row gap">
                    <button className="btn primary grow" onClick={() => vote(o.id)}>
                      <Icon name={mine === o.id ? "check" : "heart"} size={18} /> {mine === o.id ? t("poll.yourPick") : t("poll.vote")}
                    </button>
                    <a className="btn ghost" href={o.mapsUrl} target="_blank" rel="noopener noreferrer"><Icon name="map" size={18} /></a>
                    {o.phone && <a className="btn ghost" href={`tel:${o.phone.replace(/[^\d+]/g, "")}`}><Icon name="phone" size={18} /></a>}
                  </div>
                </article>
              );
            })}
          </div>
          <p className="small muted">{t("poll.footer", { date: new Date(poll.expiresAt).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US") })}</p>
        </>
      )}
    </div>
  );
}
