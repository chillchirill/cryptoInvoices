import { ExternalLink, LogIn } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../services/api.js";

export function PayPage() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [session, setSession] = useState(null);
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [invoiceData, sessionData] = await Promise.all([
      api.publicInvoice(id),
      api.session().catch(() => ({ authenticated: false }))
    ]);
    if (sessionData.authenticated && sessionData.user?.role === "client" && !invoiceData.saved) {
      setInvoice(await api.saveInvoice(id));
    } else {
      setInvoice(invoiceData);
    }
    setSession(sessionData);
  }

  useEffect(() => { load().catch((err) => setError(err.message)); }, [id]);

  async function pay() {
    setWarning("");
    setError("");
    try {
      const result = await api.solanaUrl(id);
      if (result.warning) setWarning(result.warning);
      window.location.href = result.url;
    } catch (err) {
      setError(err.message);
    }
  }

  async function save() {
    try {
      setInvoice(await api.saveInvoice(id));
      setSession(await api.session());
    } catch (err) {
      setError(err.message);
    }
  }

  function humanizeFieldName(name) {
    const words = String(name || "")
      .replace(/([a-z\d])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (!words.length) return "";
    return words.map((word, index) => {
      const lower = word.toLowerCase();
      return index === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    }).join(" ");
  }

  if (error) return <div className="pay-page"><p className="error-box">{error}</p></div>;
  if (!invoice) return <div className="pay-page"><p className="muted">Loading...</p></div>;

  const loginUrl = `/auth?mode=login&redirect=${encodeURIComponent(`/pay/${id}`)}&save=1`;
  const registerUrl = `/auth?mode=register&role=client&redirect=${encodeURIComponent(`/pay/${id}`)}&save=1`;
  const canSave = session?.authenticated && session.user?.role === "client" && !invoice.saved;
  const fieldEntries = Object.entries(invoice.fieldValues || {});

  return (
    <div className="pay-page">
      <div className="payment-card">
        <p className="eyebrow">Invoice #{invoice.id}</p>
        <h1>{invoice.fieldValues?.message || invoice.templateName || invoice.displayName || invoice.name || "Invoice"}</h1>
        <dl className="details">
          <dt>Wallet</dt><dd>{invoice.alias}</dd>
          <dt>Address</dt><dd className="mono">{invoice.address}</dd>
          {invoice.templateName && <><dt>Template</dt><dd>{invoice.templateName}</dd></>}
          {invoice.amountEur && <><dt>Legacy amount</dt><dd>EUR {invoice.amountEur}</dd></>}
        </dl>

        {fieldEntries.length > 0 && (
          <div className="invoice-fields">
            <h2>Invoice details</h2>
            <dl className="details">
              {fieldEntries.map(([name, value]) => (
                <Fragment key={name}>
                  <dt>{humanizeFieldName(name)}</dt>
                  <dd>{String(value)}</dd>
                </Fragment>
              ))}
            </dl>
          </div>
        )}

        <button className="pay-button" onClick={pay}>
          Pay <ExternalLink size={22} />
        </button>
        {warning && <p className="warning-box">{warning}</p>}

        {!session?.authenticated && (
          <div className="login-box">
            <p>Sign in or create an account to save this invoice. You will return here after authentication.</p>
            <div className="row-actions">
              <Link className="button secondary" to={loginUrl}><LogIn size={18} />Sign in</Link>
              <Link className="button primary" to={registerUrl}>Register</Link>
            </div>
          </div>
        )}

        {canSave && <button className="button secondary" onClick={save}>Save invoice</button>}
        {invoice.saved && <p className="success-box">Invoice saved to your account.</p>}
      </div>
    </div>
  );
}
