import { Fragment, useMemo } from "react";

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

function isActiveInput(node) {
  const active = String(node.getAttribute("active") || "").toLowerCase() === "true";
  const dataActive = String(node.getAttribute("data-active") || "").toLowerCase() === "true";
  return active || dataActive || node.classList.contains("active-field") || node.classList.contains("invoice-input");
}

function buildReadOnlyHtml(templateHtml, fieldValues) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(templateHtml, "text/html");

  doc.querySelectorAll("script").forEach((node) => node.remove());
  doc.querySelectorAll(".drag-handle").forEach((node) => node.remove());
  doc.querySelectorAll("[contenteditable]").forEach((node) => node.removeAttribute("contenteditable"));

  doc.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = String(attr.value || "").toLowerCase();
      if (name.startsWith("on") || value.includes("javascript:")) node.removeAttribute(attr.name);
    });
  });

  doc.querySelectorAll("input").forEach((input) => {
    if (!isActiveInput(input)) {
      input.setAttribute("disabled", "disabled");
      return;
    }

    const name = input.getAttribute("name") || input.getAttribute("data-name") || input.getAttribute("value") || "";
    const value = fieldValues?.[name] ?? "";
    const replacement = doc.createElement("div");
    replacement.className = `${input.getAttribute("class") || "invoice-input"} readonly-filled-field`;
    replacement.setAttribute("data-field-name", name);
    replacement.setAttribute("style", input.getAttribute("style") || "");
    replacement.textContent = String(value);
    input.replaceWith(replacement);
  });

  doc.querySelectorAll("textarea, select, button").forEach((node) => {
    node.setAttribute("disabled", "disabled");
  });

  const bodyContent = doc.body.innerHTML;
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; min-width: 0; background: #f8fbff; font-family: Arial, sans-serif; }
      body { padding: 0; overflow: hidden; }
      .invoice-page { margin: 0 auto; }
      .readonly-filled-field {
        align-items: center;
        display: flex;
        overflow: hidden;
        white-space: pre-wrap;
      }
      input, textarea, select, button, .readonly-filled-field { pointer-events: none; }
    </style>
  </head>
  <body>${bodyContent}</body>
</html>`;
}

export function InvoiceDocumentViewer({ invoice }) {
  const fieldValues = invoice?.fieldValues || {};
  const fieldEntries = Object.entries(fieldValues);
  const srcDoc = useMemo(
    () => (invoice?.templateHtml ? buildReadOnlyHtml(invoice.templateHtml, fieldValues) : ""),
    [invoice?.templateHtml, fieldValues]
  );

  if (!invoice) {
    return <div className="card invoice-viewer-empty"><p className="muted">Select an invoice to preview.</p></div>;
  }

  if (!invoice.templateHtml) {
    return (
      <div className="card invoice-viewer-fallback">
        <h2>{invoice.displayName || invoice.name || invoice.templateName || "Invoice"}</h2>
        <dl className="details">
          {invoice.amountEur && <><dt>Amount</dt><dd>EUR {invoice.amountEur}</dd></>}
          {invoice.alias && <><dt>Wallet</dt><dd>{invoice.alias}</dd></>}
          {fieldEntries.map(([name, value]) => (
            <Fragment key={name}>
              <dt>{humanizeFieldName(name)}</dt>
              <dd>{String(value)}</dd>
            </Fragment>
          ))}
        </dl>
      </div>
    );
  }

  return (
    <section className="invoice-document-viewer">
      <div className="viewer-header">
        <div>
          <h2>{fieldValues.message || invoice.templateName || "Invoice"}</h2>
          <p className="muted">Read-only invoice document</p>
        </div>
        {fieldValues.money && <strong>EUR {fieldValues.money}</strong>}
      </div>
      <div className="invoice-document-frame">
        <iframe title={`Invoice ${invoice.id || ""}`} sandbox="" srcDoc={srcDoc} />
      </div>
    </section>
  );
}
