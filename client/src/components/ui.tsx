import type { ReactNode } from "react";
import type { Reason } from "../api";
import { hasKey, useI18n } from "../i18n";

const CUISINE_HUE: Record<string, number> = {
  american: 18, chinese: 4, japanese: 350, korean: 12, thai: 95, vietnamese: 140, indian: 32, mexican: 45, italian: 0, mediterranean: 200,
};

/** Food photos are not bundled, so every dish is served on a lit plate. */
export function Plate({ emoji, cuisine, size = 112 }: { emoji: string; cuisine: string; size?: number }) {
  const hue = CUISINE_HUE[cuisine] ?? 20;
  return (
    <div className="plate" style={{ width: size, height: size, ["--hue" as string]: hue }} aria-hidden="true">
      <span style={{ fontSize: size * 0.42 }}>{emoji}</span>
    </div>
  );
}

export function Chips<T extends string>({ options, value, onChange, multi = false, label }: {
  options: readonly T[];
  value: T | T[] | undefined;
  onChange: (v: T | T[]) => void;
  multi?: boolean;
  label?: (v: T) => ReactNode;
}) {
  const { v } = useI18n();
  const on = (o: T) => (multi ? (value as T[]).includes(o) : value === o);
  return (
    <div className="chips" role={multi ? "group" : "radiogroup"}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className={`chip ${on(o) ? "on" : ""}`}
          aria-pressed={on(o)}
          onClick={() => {
            if (!multi) return onChange(o);
            const cur = value as T[];
            onChange(cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]);
          }}
        >
          {label?.(o) ?? v(o)}
        </button>
      ))}
    </div>
  );
}

/** Renders a server reason code in the current language. */
export function useReason() {
  const { t, lang } = useI18n();
  return (r: Pick<Reason, "code" | "params">, prefix = "r.") => {
    const key = `${prefix}${r.code}`;
    if (!hasKey(key)) return r.code;
    const p = { ...(r.params ?? {}) };
    if (p.en !== undefined) p.title = lang === "zh" ? String(p.zh) : String(p.en);
    return t(key, p);
  };
}

export function SectionHead({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="section-head">
      <div>
        <h2>{title}</h2>
        {sub && <p className="muted small">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export const fmt = (n: number) => Math.round(n).toLocaleString();
