import { useI18n } from "../i18n";

/** Shown instead of Instacart / Kroger when no API credentials are configured. */
export function Handoff() {
  const { t, v } = useI18n();
  const provider = location.pathname.split("/")[2] ?? "";
  const params = new URLSearchParams(location.search);
  const items = (params.get("items") ?? "").split("|").filter(Boolean).map((x) => x.split(":"));
  return (
    <div className="handoff">
      <p className="kicker">{v(provider).toUpperCase()}</p>
      <h1>{t("handoff.title")}</h1>
      <p className="muted">{t("handoff.body", { provider: v(provider) })}</p>
      <ul className="ingredients card">
        {items.map(([name, grams]) => (
          <li key={name}><span>{name}</span><span className="muted">{grams} g</span></li>
        ))}
      </ul>
      <button className="btn primary wide" onClick={() => (window.opener ? window.close() : (location.href = "/"))}>{t("handoff.back")}</button>
    </div>
  );
}
