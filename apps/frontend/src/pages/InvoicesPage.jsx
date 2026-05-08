import { FilePlus2, FileUp, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { InvoiceTemplateEditor } from "../components/InvoiceTemplateEditor.jsx";
import { api } from "../services/api.js";

export function InvoicesPage() {
  const pdfInputRef = useRef(null);
  const [templates, setTemplates] = useState([]);
  const [selectedName, setSelectedName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [nameDraft, setNameDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [importChoice, setImportChoice] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function loadTemplates() {
    const rows = await api.invoiceTemplates();
    setTemplates(rows);
    return rows;
  }

  useEffect(() => {
    loadTemplates().catch((err) => setError(err.message));
  }, []);

  async function selectTemplate(name) {
    setError("");
    setNotice("");
    const template = await api.invoiceTemplate(name);
    setSelectedName(template.name);
    setNameDraft(template.name);
    setSelectedTemplate(template);
    setCreating(false);
    setImportChoice("");
  }

  function startNewTemplate() {
    setSelectedName("");
    setSelectedTemplate(null);
    setNameDraft("");
    setCreating(true);
    setImportChoice("");
    setNotice("");
    setError("");
  }

  function closeEditor() {
    setSelectedName("");
    setSelectedTemplate(null);
    setNameDraft("");
    setCreating(false);
    setImportChoice("");
  }

  async function exportTemplate(html) {
    setError("");
    const payload = { html, name: nameDraft.trim() || undefined };
    const saved = selectedName
      ? await api.updateInvoiceTemplate(selectedName, payload)
      : await api.createInvoiceTemplate(payload);

    setSelectedName(saved.name);
    setNameDraft(saved.name);
    setSelectedTemplate(saved);
    setCreating(false);
    await loadTemplates();
    setNotice(`Template "${saved.name}" saved.`);
  }

  async function deleteTemplate(name) {
    setError("");
    await api.deleteInvoiceTemplate(name);
    const rows = await loadTemplates();
    if (selectedName === name) {
      setSelectedName("");
      setSelectedTemplate(null);
      setNameDraft("");
      setCreating(false);
    }
    if (!rows.length) setNotice("No templates yet. Create the first document.");
  }

  function showImportHint() {
    if (!templates.length) {
      setNotice("There are no templates available to import.");
      return;
    }
    setNotice("Choose a template from the list on the left to import it into the editor.");
  }

  async function importSelectedTemplate(name) {
    setImportChoice(name);
    if (!name) return;
    await selectTemplate(name);
  }

  async function extractFromPdf(file) {
    if (!file) return;
    setError("");
    setNotice("Extracting PDF...");
    setExtracting(true);

    try {
      const result = await api.extractInvoiceTemplateFromPdf(file);
      const suggestedName = file.name.replace(/\.pdf$/i, "").trim();
      setSelectedName("");
      setNameDraft(suggestedName);
      setSelectedTemplate({ name: "", html: result.html });
      setCreating(true);
      setImportChoice("");
      const warnings = result.warnings?.length ? ` ${result.warnings.join(" ")}` : "";
      setNotice(`PDF extracted. Review it in the editor, then Export to save.${warnings}`);
    } catch (err) {
      setNotice("");
      setError(err.message);
    } finally {
      setExtracting(false);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
    }
  }

  const hasEditor = creating || selectedTemplate;

  return (
    <div className="invoices-page">
      <aside className="invoice-template-rail">
        <div className="rail-header">
          <div>
            <h1>Invoice Templates</h1>
            <p>HTML templates</p>
          </div>
          <button className="icon-button" title="New template" onClick={startNewTemplate}>
            <FilePlus2 size={18} />
          </button>
        </div>

        <button className="button primary full-width" onClick={startNewTemplate}>
          <FilePlus2 size={18} />New Template
        </button>
        <button
          className="button secondary full-width"
          disabled={extracting}
          onClick={() => pdfInputRef.current?.click()}
        >
          <FileUp size={18} />{extracting ? "Extracting..." : "Extract from PDF"}
        </button>
        <input
          ref={pdfInputRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(event) => extractFromPdf(event.target.files?.[0])}
        />

        <div className="template-list">
          {templates.map((template) => (
            <button
              key={template.name}
              className={`template-list-item ${template.name === selectedName ? "active" : ""}`}
              onClick={() => selectTemplate(template.name).catch((err) => setError(err.message))}
            >
              <strong>{template.name}</strong>
              <span>{new Date(template.updatedAt).toLocaleString()}</span>
            </button>
          ))}
          {!templates.length && <p className="muted empty-rail">No templates yet.</p>}
        </div>
      </aside>

      <main className="invoice-template-main">
        {error && <p className="error-box">{error}</p>}
        {notice && <p className="success-box">{notice}</p>}

        {hasEditor ? (
          <section className="invoice-editor-panel">
            <div className="invoice-editor-panel-topbar">
            <div className="overlay-title">
              <strong>{selectedName || "New invoice template"}</strong>
              <span>Export saves the template to the database.</span>
            </div>

            <label className="overlay-name-field">
              Name
              <input
                value={nameDraft}
                placeholder="Invoice template will be created"
                onChange={(event) => setNameDraft(event.target.value)}
              />
            </label>

            <label className="overlay-import-field">
              Import
              <select
                value={importChoice}
                onChange={(event) => importSelectedTemplate(event.target.value).catch((err) => setError(err.message))}
              >
                <option value="">Select existing</option>
                {templates.map((template) => (
                  <option key={template.name} value={template.name}>{template.name}</option>
                ))}
              </select>
            </label>

            {selectedName && (
              <button
                className="button danger-button"
                onClick={() => deleteTemplate(selectedName).catch((err) => setError(err.message))}
              >
                <Trash2 size={18} />Delete
              </button>
            )}

            <button className="icon-button overlay-close" title="Close editor" onClick={closeEditor}>
              <X size={20} />
            </button>
          </div>

          {error && <p className="error-box">{error}</p>}
          <InvoiceTemplateEditor
            key={selectedName || (creating ? "new-template" : "blank")}
            initialHtml={selectedTemplate?.html || ""}
            onExport={exportTemplate}
            onImportRequest={showImportHint}
          />
          </section>
        ) : (
          <div className="card invoice-empty-state">
            <h2>{templates.length ? "Select a template" : "No templates yet"}</h2>
            <p className="muted">
              {templates.length
                ? "Select an invoice template from the list, or create a new document."
                : "Create the first HTML invoice template so it can be imported and edited later."}
            </p>
            <button className="button primary" onClick={startNewTemplate}>
              <FilePlus2 size={18} />Create New Document
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
