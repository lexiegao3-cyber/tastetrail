import { useState, type FormEvent } from "react";
import { api } from "../api";
import { Icon } from "../components/Icon";
import { useI18n } from "../i18n";

export function AuthView({ onAuthed }: { onAuthed: () => void }) {
  const { t, lang, setLang } = useI18n();
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.auth(mode, email, password);
      onAuthed();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-hero" aria-hidden="true">
        {["🍣", "🍜", "🥗", "🌮", "🍳", "🥘", "🍝", "🥟", "🍛"].map((e, i) => (
          <span key={i} className="hero-plate" style={{ ["--i" as string]: i }}>{e}</span>
        ))}
      </div>
      <div className="auth-body">
        <div className="row between">
          <span className="wordmark">PlateWise</span>
          <button className="lang" onClick={() => setLang(lang === "en" ? "zh" : "en")}>{lang === "en" ? "中文" : "EN"}</button>
        </div>
        <h1 className="auth-title">{t("app.tagline")}</h1>
        <p className="muted">{t("app.lede")}</p>
        <form onSubmit={submit} className="auth-form">
          <label className="field">
            <span>{t("auth.email")}</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>{t("auth.password")}</span>
            <input type="password" required minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="row between center">
            <button type="button" className="link" onClick={() => setMode(mode === "login" ? "register" : "login")}>
              {mode === "login" ? t("auth.switchToRegister") : t("auth.switchToLogin")}
            </button>
            <button className="go" disabled={busy} aria-label={mode === "login" ? t("auth.login") : t("auth.register")}>
              <Icon name="arrow" size={30} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
