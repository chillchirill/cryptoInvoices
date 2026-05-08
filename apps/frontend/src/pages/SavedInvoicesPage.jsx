import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api.js";

export function SavedInvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api.savedInvoices().then(setInvoices).catch((err) => setError(err.message));
  }, []);

  return (
    <div className="page">
      <div className="page-title">
        <div><h1>Saved Invoices</h1><p className="muted">Invoices you saved after scanning a QR code.</p></div>
      </div>
      {error && <p className="error-box">{error}</p>}
      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>Amount</th><th>Wallet</th><th></th></tr></thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td>{invoice.name}</td>
                <td>EUR {invoice.amountEur}</td>
                <td>{invoice.alias}</td>
                <td><Link className="button secondary" to={`/pay/${invoice.id}`}><ExternalLink size={16} />Open</Link></td>
              </tr>
            ))}
            {!invoices.length && <tr><td colSpan="4" className="muted">No saved invoices yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
