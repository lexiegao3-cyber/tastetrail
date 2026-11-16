import { useEffect, useMemo, useState } from "react";
import { Header } from "../App";
import { api, type Recommendation } from "../api";
import { Icon } from "../components/Icon";
import { Chips, fmt, Plate, SectionHead, useReason } from "../components/ui";
import { useI18n } from "../i18n";
import { useStore } from "../store";

export function HomeView() {
  const s = useStore();
  const { t, lang } = useI18n();
  const reason = useReason();
  const [mode, setMode] = useState(s.prefs.mode);
  const [cuisine, setCuisine] = useState<string>("all");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Recommendation[] | null>(null);
  const [eaten, setEaten] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setQuery(q), 250);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    let live = true;
    setError("");
    api
      .recommend({ mode, cuisine: cuisine === "all" ? undefined : cuisine, q: query || undefined, limit: 14 })
      .then((r) => {
        if (!live) return;
        setItems(r.items);
        setEaten(r.intake.kcal);
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [mode, cuisine, query, s.version]);

  const useItUp = useMemo(() => items?.filter((i) => i.reasons.some((r) => r.code === "convenience.expiring")) ?? [], [items]);
  const picks = items?.slice(0, 6) ?? [];
  const more = items?.slice(6) ?? [];
  const title = (r: Recommendation) => (lang === "zh" ? r.recipe.title.zh : r.recipe.title.en);

  return (
    <>
      <Header title="PlateWise" sub={t("home.left", { kcal: fmt(Math.max(0, s.prefs.dailyKcal - eaten)) })} />
      <div className="search">
        <Icon name="search" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("home.search")} aria-label={t("home.search")} />
        <div className="seg" role="radiogroup" aria-label={t("profile.mode")}>
          {(["everyday", "fitness"] as const).map((m) => (
            <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>
              {t(m === "everyday" ? "home.everyday" : "home.fitness")}
            </button>
          ))}
        </div>
      </div>
      <Chips options={["all", ...s.meta.cuisines]} value={cuisine} onChange={(v) => setCuisine(v as string)} label={(o) => (o === "all" ? t("home.all") : undefined)} />

      {error && <p className="error">{error}</p>}
      {items && items.length === 0 && <p className="empty">{t("home.empty")}</p>}

      {useItUp.length > 0 && (
        <section>
          <SectionHead title={t("home.useItUp")} sub={t("home.useItUpSub")} />
          <div className="rail">
            {useItUp.map((r) => (
              <OfferCard key={r.recipe.id} r={r} title={title(r)} line={reason(r.reasons.find((x) => x.code === "convenience.expiring")!)} />
            ))}
          </div>
        </section>
      )}

      {picks.length > 0 && (
        <section>
          <SectionHead title={t("home.title")} />
          <div className="rail">
            {picks.map((r) => (
              <PickCard key={r.recipe.id} r={r} title={title(r)} />
            ))}
          </div>
        </section>
      )}

      {more.length > 0 && (
        <section>
          <SectionHead title={t("home.more")} />
          <div className="list">
            {more.map((r) => (
              <OfferCard key={r.recipe.id} r={r} title={title(r)} line={reason(r.reasons[0]!)} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function AddButton({ id }: { id: string }) {
  const s = useStore();
  const { t } = useI18n();
  const inBag = s.bag.includes(id);
  return (
    <button
      className={`add ${inBag ? "in" : ""}`}
      aria-label={inBag ? t("card.added") : t("card.add")}
      aria-pressed={inBag}
      onClick={(e) => {
        e.stopPropagation();
        s.toggleBag(id);
      }}
    >
      <Icon name={inBag ? "check" : "plus"} size={18} />
    </button>
  );
}

function PickCard({ r, title }: { r: Recommendation; title: string }) {
  const s = useStore();
  const { t } = useI18n();
  const reason = useReason();
  const n = r.recipe.nutrition;
  return (
    <article className="pick" onClick={() => s.setOpenRecipe(r.recipe.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && s.setOpenRecipe(r.recipe.id)}>
      <div className="pick-art">
        <Plate emoji={r.recipe.emoji} cuisine={r.recipe.cuisine} size={104} />
      </div>
      <h3>{title}</h3>
      <p className="meta">
        <Icon name="flame" size={13} /> {fmt(n.kcal)} kcal · {Math.round(n.protein)}g {t("detail.protein")}
      </p>
      <p className="why">{reason(r.reasons[0]!)}</p>
      <div className="row between center">
        <span className="price">
          <b>${r.recipe.costPerServing.toFixed(2)}</b>
          <small>{t("card.perServing")}</small>
        </span>
        <AddButton id={r.recipe.id} />
      </div>
    </article>
  );
}

function OfferCard({ r, title, line }: { r: Recommendation; title: string; line: string }) {
  const s = useStore();
  const { v } = useI18n();
  const n = r.recipe.nutrition;
  return (
    <article className="offer" onClick={() => s.setOpenRecipe(r.recipe.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && s.setOpenRecipe(r.recipe.id)}>
      <Plate emoji={r.recipe.emoji} cuisine={r.recipe.cuisine} size={72} />
      <div className="grow">
        <h3>{title}</h3>
        <p className="tag-line"><Icon name="crown" size={12} /> {v(r.recipe.cuisine)} · {r.recipe.minutes} min</p>
        <p className="why">{line}</p>
      </div>
      <div className="offer-side">
        <b>{fmt(n.kcal)}</b>
        <small>kcal</small>
        <AddButton id={r.recipe.id} />
      </div>
    </article>
  );
}
