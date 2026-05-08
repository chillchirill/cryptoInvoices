import { Eye } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useEffect, useMemo, useState } from "react";
import { InvoiceDocumentViewer } from "../components/InvoiceDocumentViewer.jsx";
import { api } from "../services/api.js";

const paymentOrigin = (import.meta.env.VITE_PUBLIC_PAYMENT_ORIGIN || window.location.origin).replace(/\/$/, "");
const REQUIRED_FIELDS = ["money", "message"];

export function PaymentRequestsPage() {
  const [wallets, setWallets] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [requests, setRequests] = useState([]);
  const [created, setCreated] = useState(null);
  const [previewInvoice, setPreviewInvoice] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const [form, setForm] = useState({ walletAlias: "", templateName: "", fields: {} });
  const [error, setError] = useState("");

  const paymentUrl = useMemo(() => (
    created ? `${paymentOrigin}/pay/${created.id}` : ""
  ), [created]);

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

  async function load() {
    const [walletList, templateList, requestList] = await Promise.all([
      api.wallets(),
      api.invoiceTemplates(),
      api.paymentRequests()
    ]);
    setWallets(walletList);
    setTemplates(templateList);
    setRequests(requestList);
    setForm((current) => ({
      ...current,
      walletAlias: current.walletAlias || walletList[0]?.alias || "",
      templateName: current.templateName || templateList[0]?.name || ""
    }));
    if (!selectedTemplate && templateList[0]) {
      const template = await api.invoiceTemplate(templateList[0].name);
      setSelectedTemplate(template);
      setForm((current) => ({ ...current, templateName: template.name, fields: {} }));
    }
  }

  useEffect(() => { load().catch((err) => setError(err.message)); }, []);

  async function selectTemplate(name) {
    setError("");
    setForm((current) => ({ ...current, templateName: name, fields: {} }));
    setSelectedTemplate(null);
    if (!name) return;
    const template = await api.invoiceTemplate(name);
    setSelectedTemplate(template);
  }

  function updateField(name, value) {
    setForm((current) => ({
      ...current,
      fields: { ...current.fields, [name]: value }
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const result = await api.createPaymentRequest(form);
      setCreated(result);
      setPreviewError("");
      api.publicInvoice(result.id)
        .then(setPreviewInvoice)
        .catch((err) => {
          setPreviewInvoice(null);
          setPreviewError(`Preview unavailable: ${err.message}`);
        });
      setForm((current) => ({ ...current, fields: {} }));
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function previewRequest(id) {
    setPreviewError("");
    try {
      setPreviewInvoice(await api.publicInvoice(id));
    } catch (err) {
      setPreviewError(err.message);
    }
  }

  return (
    <div className="page">
      <div className="page-title">
        <div><h1>Payment Requests</h1><p className="muted">Create an endpoint and QR code for a client.</p></div>
      </div>

      <div className="split">
        <form className="card form-grid" onSubmit={submit}>
          <label>
            Wallet
            <select value={form.walletAlias} onChange={(event) => setForm({ ...form, walletAlias: event.target.value })} required>
              {wallets.map((wallet) => <option key={wallet.alias} value={wallet.alias}>{wallet.alias}</option>)}
            </select>
          </label>
          <label>
            Invoice template
            <select
              value={form.templateName}
              onChange={(event) => selectTemplate(event.target.value).catch((err) => setError(err.message))}
              required
            >
              {templates.map((template) => <option key={template.name} value={template.name}>{template.name}</option>)}
            </select>
          </label>
          {selectedTemplate?.activeFields?.map((field) => (
            <label key={field.name}>
              {humanizeFieldName(field.name)}
              <input
                type={field.name === "money" ? "number" : "text"}
                step={field.name === "money" ? "0.01" : undefined}
                min={field.name === "money" ? "0.01" : undefined}
                value={form.fields[field.name] || ""}
                onChange={(event) => updateField(field.name, event.target.value)}
                required={REQUIRED_FIELDS.includes(field.name)}
              />
            </label>
          ))}
          {error && <p className="error-box">{error}</p>}
          <button className="button primary" disabled={!wallets.length || !templates.length}>Create QR</button>
          {!wallets.length && <p className="warning-box">Add a wallet first.</p>}
          {!templates.length && <p className="warning-box">Create an invoice template first.</p>}
        </form>

        <div className="card qr-panel">
          <h2>Latest QR</h2>
          {created ? (
            <>
              <QRCodeCanvas value={paymentUrl} size={220} />
              <p className="mono">{paymentUrl}</p>
              <p><strong>{created.fields?.message || created.templateName || created.name || "Invoice"}</strong> · EUR {created.fields?.money}</p>
            </>
          ) : (
            <p className="muted">The QR code will appear here after submit.</p>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Created requests</h2>
        <table>
          <thead><tr><th>Template</th><th>Alias</th><th>Fields</th><th>Endpoint</th><th></th></tr></thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request.id}>
                <td>{request.templateName || "Legacy"}</td>
                <td>{request.alias}</td>
                <td>{request.fields?.money ? `EUR ${request.fields.money}` : Object.keys(request.fields || {}).length || (request.amountEur ? 2 : 0)}</td>
                <td className="mono">/pay/{request.id}</td>
                <td>
                  <button className="button secondary" onClick={() => previewRequest(request.id)}>
                    <Eye size={16} />Preview
                  </button>
                </td>
              </tr>
            ))}
            {!requests.length && <tr><td colSpan="5" className="muted">No requests yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {(previewInvoice || previewError) && (
        <div className="invoice-preview-section">
          {previewError && <p className="error-box">{previewError}</p>}
          {previewInvoice && <InvoiceDocumentViewer invoice={previewInvoice} />}
        </div>
      )}
    </div>
  );
}
