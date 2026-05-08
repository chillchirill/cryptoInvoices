import { QRCodeCanvas } from "qrcode.react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api.js";

const paymentOrigin = (import.meta.env.VITE_PUBLIC_PAYMENT_ORIGIN || window.location.origin).replace(/\/$/, "");

export function PaymentRequestsPage() {
  const [wallets, setWallets] = useState([]);
  const [requests, setRequests] = useState([]);
  const [created, setCreated] = useState(null);
  const [form, setForm] = useState({ walletAlias: "", name: "", amountEur: "" });
  const [error, setError] = useState("");

  const paymentUrl = useMemo(() => (
    created ? `${paymentOrigin}/pay/${created.id}` : ""
  ), [created]);

  async function load() {
    const [walletList, requestList] = await Promise.all([api.wallets(), api.paymentRequests()]);
    setWallets(walletList);
    setRequests(requestList);
    if (!form.walletAlias && walletList[0]) setForm((current) => ({ ...current, walletAlias: walletList[0].alias }));
  }

  useEffect(() => { load().catch((err) => setError(err.message)); }, []);

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const result = await api.createPaymentRequest(form);
      setCreated(result);
      setForm({ walletAlias: wallets[0]?.alias || "", name: "", amountEur: "" });
      await load();
    } catch (err) {
      setError(err.message);
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
          <label>Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          <label>Amount EUR<input type="number" step="0.01" min="0.01" value={form.amountEur} onChange={(event) => setForm({ ...form, amountEur: event.target.value })} required /></label>
          {error && <p className="error-box">{error}</p>}
          <button className="button primary" disabled={!wallets.length}>Create QR</button>
          {!wallets.length && <p className="warning-box">Add a wallet first.</p>}
        </form>

        <div className="card qr-panel">
          <h2>Latest QR</h2>
          {created ? (
            <>
              <QRCodeCanvas value={paymentUrl} size={220} />
              <p className="mono">{paymentUrl}</p>
              <p><strong>{created.name}</strong> · EUR {created.amountEur}</p>
            </>
          ) : (
            <p className="muted">The QR code will appear here after submit.</p>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Created requests</h2>
        <table>
          <thead><tr><th>Name</th><th>Alias</th><th>Amount</th><th>Endpoint</th></tr></thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request.id}>
                <td>{request.name}</td>
                <td>{request.alias}</td>
                <td>EUR {request.amountEur}</td>
                <td className="mono">/pay/{request.id}</td>
              </tr>
            ))}
            {!requests.length && <tr><td colSpan="4" className="muted">No requests yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
