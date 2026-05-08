import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { InvoiceDocumentViewer } from "../components/InvoiceDocumentViewer.jsx";
import { api } from "../services/api.js";

function invoiceSubtitle(invoice) {
  if (invoice.fieldValues?.money) return `EUR ${invoice.fieldValues.money}`;
  if (invoice.amountEur) return `EUR ${invoice.amountEur}`;
  return invoice.templateName || invoice.alias || invoice.id;
}

export function BusinessInvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.invoices()
      .then((rows) => {
        setInvoices(rows);
        setSelectedInvoice(rows[0] || null);
      })
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="page">
      <div className="page-title">
        <div><h1>Invoices</h1><p className="muted">Previously created payment request invoices.</p></div>
      </div>

      {error && <p className="error-box">{error}</p>}

      <div className="saved-invoices-layout">
        <div className="card saved-invoices-list">
          {invoices.map((invoice) => (
            <button
              key={invoice.id}
              className={`saved-invoice-item ${selectedInvoice?.id === invoice.id ? "active" : ""}`}
              onClick={() => setSelectedInvoice(invoice)}
            >
              <strong>{invoice.title}</strong>
              <span>{invoiceSubtitle(invoice)}</span>
            </button>
          ))}
          {!invoices.length && <p className="muted">No invoices yet.</p>}
        </div>

        <div className="saved-invoice-preview">
          {selectedInvoice && (
            <div className="row-actions invoice-preview-actions">
              <Link className="button secondary" to={`/pay/${selectedInvoice.id}`}>
                <ExternalLink size={16} />Open payment page
              </Link>
            </div>
          )}
          <InvoiceDocumentViewer invoice={selectedInvoice} />
        </div>
      </div>
    </div>
  );
}
