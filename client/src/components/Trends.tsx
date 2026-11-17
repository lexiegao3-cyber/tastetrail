import { useEffect, useState } from "react";
import { api, type Trends as TrendsData } from "../api";
import { useI18n } from "../i18n";
import { useStore } from "../store";
import { fmt, SectionHead } from "./ui";

/** Last 14 days: daily kcal against the target band, plus the numbers that explain it. */
export function Trends() {
  const s = useStore();
  const { t, lang } = useI18n();
  const [data, setData] = useState<TrendsData | null>(null);
  useEffect(() => {
    api.trends(14).then(setData, () => undefined);
  }, [s.version]);
  if (!data) return null;
  const { daily, targets, summary } = data;
  const top = Math.max(targets.kcal * 1.4, ...daily.map((d) => d.kcal));
  const pct = (x: number) => `${(x / top) * 100}%`;
  const label = (d: string) => (lang === "zh" ? `${Number(d.slice(8))}日` : String(Number(d.slice(8))));

  return (
    <section>
      <SectionHead title={t("trends.title")} sub={t("trends.sub", { days: summary.loggedDays })} />
      <div className="card trends">
        <div className="chart" role="img" aria-label={t("trends.chartLabel", { avg: fmt(summary.avgKcal), target: fmt(targets.kcal) })}>
          <div className="plot">
            <div className="band" style={{ bottom: pct(targets.kcal * 0.9), height: pct(targets.kcal * 0.2) }} />
            {daily.map((d) => {
              const on = d.meals > 0 && Math.abs(d.kcal - targets.kcal) <= targets.kcal * 0.1;
              return (
                <div key={d.day} className="col" title={`${d.day}: ${fmt(d.kcal)} kcal`}>
                  <div className={`bar-v ${d.meals === 0 ? "none" : on ? "on" : ""}`} style={{ height: d.meals ? pct(d.kcal) : "3px" }} />
                </div>
              );
            })}
          </div>
          <div className="labels">{daily.map((d) => <small key={d.day}>{label(d.day)}</small>)}</div>
        </div>
        <p className="small muted">{t("trends.legend", { lo: fmt(targets.kcal * 0.9), hi: fmt(targets.kcal * 1.1) })}</p>
        <div className="stats">
          <div><b>{fmt(summary.avgKcal)}</b><small>{t("trends.avgKcal")}</small></div>
          <div><b>{summary.avgProtein} / {targets.protein} g</b><small>{t("trends.avgProtein")}</small></div>
          <div><b>{summary.daysOnTarget}/{summary.loggedDays}</b><small>{t("trends.onTarget")}</small></div>
          <div><b>{Math.round(summary.takeoutShare * 100)}%</b><small>{t("trends.takeout")}</small></div>
          <div><b>${summary.groceryUsd.toFixed(0)}</b><small>{t("trends.grocery", { n: summary.groceryOrders })}</small></div>
          <div><b>${summary.wasteUsd.toFixed(2)}</b><small>{t("trends.waste", { n: summary.wasteItems })}</small></div>
        </div>
      </div>
    </section>
  );
}
