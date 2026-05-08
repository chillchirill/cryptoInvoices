import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../services/api.js";

export function AuthPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState(params.get("mode") || "login");
  const [form, setForm] = useState({
    email: "",
    password: "",
    role: params.get("role") || "business"
  });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    api.session().then((session) => {
      if (session.authenticated) finishAuthRedirect();
    }).catch(() => {});
  }, []);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function finishAuthRedirect() {
    const redirect = params.get("redirect");
    const shouldSave = params.get("save") === "1";
    const session = await api.session().catch(() => null);

    if (redirect && shouldSave && redirect.startsWith("/pay/")) {
      const id = redirect.split("/pay/")[1]?.split("?")[0];
      if (id) await api.saveInvoice(id).catch(() => {});
    }
    navigate(redirect || (session?.user?.role === "client" ? "/saved" : "/wallets"), { replace: true });
  }

  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError("");

    try {
      if (mode === "register") {
        await api.register(form);
      } else {
        await api.login({ email: form.email, password: form.password });
      }
      await finishAuthRedirect();
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <Link className="brand auth-brand" to="/">QR Pay</Link>
        <h1>{mode === "register" ? "Create account" : "Sign in"}</h1>
        <p className="muted">Email and password are stored in PostgreSQL. The session uses an HttpOnly cookie.</p>

        <div className="segmented two">
          <button type="button" className={mode === "login" ? "selected" : ""} onClick={() => setMode("login")}>Sign in</button>
          <button type="button" className={mode === "register" ? "selected" : ""} onClick={() => setMode("register")}>Register</button>
        </div>

        {mode === "register" && (
          <div className="segmented two">
            <button type="button" className={form.role === "business" ? "selected" : ""} onClick={() => update("role", "business")}>Business</button>
            <button type="button" className={form.role === "client" ? "selected" : ""} onClick={() => update("role", "client")}>Client</button>
          </div>
        )}

        <label>Email<input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} required /></label>
        <label>Password<input type="password" value={form.password} onChange={(event) => update("password", event.target.value)} required /></label>
        {error && <p className="error-box">{error}</p>}
        <button className="button primary" disabled={pending}>{pending ? "Please wait..." : "Continue"}</button>
      </form>
    </div>
  );
}
