import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Eraser, FileInput, Image, Move, Trash2, Type, Upload } from "lucide-react";
import { Rnd } from "react-rnd";

const PAGE_SIZE = { width: 794, height: 1123 };
const DEFAULT_STYLE = { fontSize: 18, fontFamily: "Arial", color: "#111827" };

const STARTER_ELEMENTS = [
  {
    id: "text-title",
    type: "text",
    x: 72,
    y: 68,
    width: 280,
    height: 52,
    text: "Invoice",
    fontSize: 36,
    fontFamily: "Arial",
    color: "#111827"
  },
  {
    id: "text-company",
    type: "text",
    x: 72,
    y: 145,
    width: 260,
    height: 84,
    text: "Your Company\nStreet address\nCity, Country",
    fontSize: 15,
    fontFamily: "Arial",
    color: "#374151"
  },
  {
    id: "input-client-name",
    type: "input",
    name: "client_name",
    x: 455,
    y: 150,
    width: 220,
    height: 38,
    fontSize: 16,
    fontFamily: "Arial",
    color: "#111827"
  }
];

function createId(prefix) {
  if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 10000)}`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function numberFromStyle(value, fallback) {
  const parsed = Number.parseFloat(value || "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

function inlineStyle(element) {
  const common = [
    "position:absolute",
    `left:${Math.round(element.x)}px`,
    `top:${Math.round(element.y)}px`,
    `width:${Math.round(element.width)}px`,
    `height:${Math.round(element.height)}px`,
    `font-size:${element.fontSize}px`,
    `font-family:${element.fontFamily}`,
    `color:${element.color}`,
    "box-sizing:border-box"
  ];

  if (element.type === "text") common.push("white-space:pre-wrap", "overflow:hidden");
  if (element.type === "input") {
    common.push("border:1px solid #2563eb", "background:rgba(37,99,235,0.08)", "padding:6px 8px");
  }
  if (element.type === "image") {
    return [
      "position:absolute",
      `left:${Math.round(element.x)}px`,
      `top:${Math.round(element.y)}px`,
      `width:${Math.round(element.width)}px`,
      `height:${Math.round(element.height)}px`,
      "object-fit:contain",
      "box-sizing:border-box"
    ].join(";");
  }

  return common.join(";");
}

function elementToHtml(element) {
  const style = inlineStyle(element);
  if (element.type === "text") {
    return `<div class="invoice-text" style="${style}">${escapeHtml(element.text)}</div>`;
  }
  if (element.type === "input") {
    return `<input active="true" name="${escapeHtml(element.name)}" class="invoice-input active-field" value="${escapeHtml(element.name)}" style="${style}">`;
  }
  return `<img class="invoice-image" src="${escapeHtml(element.src)}" alt="" style="${style}">`;
}

export function elementsToHtml(elements) {
  const items = elements.map(elementToHtml).join("\n  ");
  return `<div class="invoice-page" style="position:relative;width:${PAGE_SIZE.width}px;height:${PAGE_SIZE.height}px;background:#ffffff;box-sizing:border-box;overflow:hidden;">
  ${items}
</div>`;
}

function parseStyleNode(node, fallback) {
  const style = node.style;
  return {
    x: numberFromStyle(style.left, fallback.x),
    y: numberFromStyle(style.top, fallback.y),
    width: numberFromStyle(style.width, fallback.width),
    height: numberFromStyle(style.height, fallback.height),
    fontSize: numberFromStyle(style.fontSize, fallback.fontSize),
    fontFamily: style.fontFamily || fallback.fontFamily,
    color: style.color || fallback.color
  };
}

export function parseHtmlToElements(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const page = doc.querySelector(".invoice-page") || doc.body;
  const nodes = [...page.children];

  return nodes
    .map((node, index) => {
      const tag = node.tagName.toLowerCase();
      const classList = node.classList;
      const isInput = tag === "input" || classList.contains("invoice-input");
      const isImage = tag === "img" || classList.contains("invoice-image");
      const isText = tag === "div" || classList.contains("invoice-text");
      const base = parseStyleNode(node, {
        x: 60 + index * 18,
        y: 60 + index * 18,
        width: isImage ? 180 : 220,
        height: isImage ? 120 : 42,
        ...DEFAULT_STYLE
      });

      if (isInput) {
        return {
          id: createId("input"),
          type: "input",
          name: node.getAttribute("name") || node.getAttribute("value") || node.value || "",
          ...base
        };
      }

      if (isImage) {
        return { id: createId("image"), type: "image", src: node.getAttribute("src") || "", ...base };
      }

      if (isText) {
        return { id: createId("text"), type: "text", text: node.textContent || "", ...base };
      }

      return null;
    })
    .filter(Boolean);
}

function getElementsFromHtml(html) {
  if (!html) return STARTER_ELEMENTS;
  const parsed = parseHtmlToElements(html);
  return parsed.length ? parsed : STARTER_ELEMENTS;
}

function MiniIcon({ name }) {
  const icons = {
    text: Type,
    input: FileInput,
    image: Image,
    delete: Trash2,
    export: Download,
    import: Upload,
    clear: Eraser,
    move: Move
  };
  const Icon = icons[name];
  return <Icon className="mini-icon" size={16} aria-hidden="true" />;
}

export function InvoiceTemplateEditor({ initialHtml = "", onExport, onImportRequest }) {
  const fileInputRef = useRef(null);
  const [elements, setElements] = useState(() => getElementsFromHtml(initialHtml));
  const [selectedId, setSelectedId] = useState(null);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [draftStyle, setDraftStyle] = useState(DEFAULT_STYLE);
  const [status, setStatus] = useState("Ready");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next = getElementsFromHtml(initialHtml);
    setElements(next);
    setSelectedId(next[0]?.id || null);
    setDeleteTargetId(null);
    setStatus(initialHtml ? "Template imported" : "New document");
  }, [initialHtml]);

  useEffect(() => {
    function handleKeyboardDelete(event) {
      if (event.key !== "Delete" || !deleteTargetId) return;
      event.preventDefault();
      setElements((current) => current.filter((element) => element.id !== deleteTargetId));
      setSelectedId(null);
      setDeleteTargetId(null);
    }

    window.addEventListener("keydown", handleKeyboardDelete);
    return () => window.removeEventListener("keydown", handleKeyboardDelete);
  }, [deleteTargetId]);

  const selectedElement = elements.find((element) => element.id === selectedId);
  const activeFields = useMemo(
    () =>
      elements
        .filter((element) => element.type === "input" && element.name.trim())
        .map((element) => ({
          name: element.name.trim(),
          x: Math.round(element.x),
          y: Math.round(element.y),
          width: Math.round(element.width),
          height: Math.round(element.height)
        })),
    [elements]
  );

  function updateElement(id, updater) {
    setElements((current) =>
      current.map((element) =>
        element.id === id ? { ...element, ...(typeof updater === "function" ? updater(element) : updater) } : element
      )
    );
  }

  function removeUnnamedInputs(nextSelectedId = null) {
    setElements((current) =>
      current.filter((element) => element.id === nextSelectedId || element.type !== "input" || element.name.trim())
    );
  }

  function selectElement(id, canDelete = false) {
    removeUnnamedInputs(id);
    setSelectedId(id);
    setDeleteTargetId(canDelete ? id : null);
  }

  function updateStyle(key, value) {
    const normalizedValue = key === "fontSize" ? Number(value) : value;
    setDraftStyle((current) => ({ ...current, [key]: normalizedValue }));
    if (selectedElement?.type !== "image") updateElement(selectedElement.id, { [key]: normalizedValue });
  }

  function addText() {
    const id = createId("text");
    const element = {
      id,
      type: "text",
      x: 96,
      y: 260,
      width: 240,
      height: 64,
      text: "Text field",
      ...draftStyle
    };
    removeUnnamedInputs(id);
    setElements((current) => [...current, element]);
    setSelectedId(id);
    setDeleteTargetId(null);
  }

  function addActiveInput() {
    const id = createId("input");
    const element = { id, type: "input", name: "", x: 420, y: 260, width: 220, height: 40, ...draftStyle };
    removeUnnamedInputs(id);
    setElements((current) => [...current, element]);
    setSelectedId(id);
    setDeleteTargetId(null);
  }

  function addImageFromFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const id = createId("image");
      const element = { id, type: "image", src: reader.result, x: 96, y: 360, width: 220, height: 150 };
      removeUnnamedInputs(id);
      setElements((current) => [...current, element]);
      setSelectedId(id);
      setDeleteTargetId(null);
      setStatus("Image added as base64");
    };
    reader.readAsDataURL(file);
  }

  function deleteSelected() {
    if (!selectedId) return;
    setElements((current) => current.filter((element) => element.id !== selectedId));
    setSelectedId(null);
    setDeleteTargetId(null);
  }

  async function exportHtml() {
    const cleaned = elements.filter((element) => element.type !== "input" || element.name.trim());
    const html = elementsToHtml(cleaned);
    setElements(cleaned);
    setDeleteTargetId((currentTarget) => (cleaned.some((element) => element.id === currentTarget) ? currentTarget : null));
    setSaving(true);
    setStatus("Exporting...");

    try {
      await onExport(html);
      setStatus("Export saved");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSaving(false);
    }
  }

  function clearDocument() {
    setElements([]);
    setSelectedId(null);
    setDeleteTargetId(null);
    setStatus("Document cleared");
  }

  function handlePagePointerDown(event) {
    if (event.target.classList.contains("invoice-page")) {
      removeUnnamedInputs();
      setSelectedId(null);
      setDeleteTargetId(null);
    }
  }

  const toolbarStyle = selectedElement && selectedElement.type !== "image" ? selectedElement : draftStyle;

  return (
    <main className="invoice-editor-app">
      <aside
        className="invoice-editor-toolbar"
        aria-label="Invoice editor toolbar"
        onMouseDownCapture={(event) => {
          if (!event.target.closest("[data-delete-action]")) setDeleteTargetId(null);
        }}
      >
        <div className="editor-brand-block">
          <div className="editor-brand-mark">IE</div>
          <div>
            <h1>Invoice Editor</h1>
            <p>HTML document builder</p>
          </div>
        </div>

        <div className="editor-toolbar-group">
          <div className="editor-group-title">Insert</div>
          <button type="button" className="editor-tool-button" onClick={addText}>
            <MiniIcon name="text" /> <span>Text</span>
          </button>
          <button type="button" className="editor-tool-button primary-tool" onClick={addActiveInput}>
            <MiniIcon name="input" /> <span>Active Input</span>
          </button>
          <button type="button" className="editor-tool-button" onClick={() => fileInputRef.current?.click()}>
            <MiniIcon name="image" /> <span>Image</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="visually-hidden"
            hidden
            tabIndex={-1}
            onChange={(event) => addImageFromFile(event.target.files?.[0])}
          />
        </div>

        <div className="editor-toolbar-group">
          <div className="editor-group-title">Style</div>
          <label>
            Font
            <select
              value={toolbarStyle.fontFamily}
              disabled={selectedElement?.type === "image"}
              onChange={(event) => updateStyle("fontFamily", event.target.value)}
            >
              <option value="Arial">Arial</option>
              <option value="Georgia">Georgia</option>
              <option value="Times New Roman">Times New Roman</option>
              <option value="Courier New">Courier New</option>
              <option value="Inter">Inter</option>
            </select>
          </label>
          <label>
            Size
            <input
              type="number"
              min="8"
              max="96"
              value={toolbarStyle.fontSize}
              disabled={selectedElement?.type === "image"}
              onChange={(event) => updateStyle("fontSize", event.target.value)}
            />
          </label>
          <label>
            Color
            <input
              type="color"
              value={toolbarStyle.color}
              disabled={selectedElement?.type === "image"}
              onChange={(event) => updateStyle("color", event.target.value)}
            />
          </label>
        </div>

        {selectedElement?.type === "input" && (
          <div className="editor-toolbar-group active-settings">
            <div className="editor-group-title">Active field</div>
            <label>
              Active input name
              <input
                type="text"
                value={selectedElement.name}
                placeholder="client_name"
                onChange={(event) => updateElement(selectedElement.id, { name: event.target.value })}
              />
            </label>
          </div>
        )}

        <div className="editor-toolbar-group">
          <div className="editor-group-title">Document</div>
          <button type="button" data-delete-action className="editor-tool-button danger-tool" disabled={!selectedId} onClick={deleteSelected}>
            <MiniIcon name="delete" /> <span>Delete</span>
          </button>
          <button type="button" className="editor-tool-button" disabled={saving} onClick={exportHtml}>
            <MiniIcon name="export" /> <span>{saving ? "Saving..." : "Export"}</span>
          </button>
          <button type="button" className="editor-tool-button" onClick={onImportRequest}>
            <MiniIcon name="import" /> <span>Import</span>
          </button>
          <button type="button" className="editor-tool-button" onClick={clearDocument}>
            <MiniIcon name="clear" /> <span>Clear</span>
          </button>
        </div>

        <section className="active-fields-panel">
          <h2>Active fields</h2>
          {activeFields.length ? (
            <ul>
              {activeFields.map((field) => (
                <li key={field.name}>
                  <strong>{field.name}</strong>
                  <span>{field.x}, {field.y} - {field.width}x{field.height}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No named active inputs</p>
          )}
        </section>

        <p className="editor-status">{status}</p>
      </aside>

      <section className="invoice-editor-workspace" aria-label="Invoice document workspace">
        <div className="invoice-page-frame">
          <div
            className="invoice-page"
            style={{ width: PAGE_SIZE.width, height: PAGE_SIZE.height }}
            onMouseDown={handlePagePointerDown}
          >
            {elements.map((element) => (
              <Rnd
                key={element.id}
                size={{ width: element.width, height: element.height }}
                position={{ x: element.x, y: element.y }}
                bounds=".invoice-page"
                minWidth={32}
                minHeight={24}
                dragHandleClassName="drag-handle"
                className={`editor-frame ${selectedId === element.id ? "selected" : ""} ${
                  deleteTargetId === element.id ? "delete-armed" : ""
                }`}
                onMouseDown={(event) => {
                  event.stopPropagation();
                  selectElement(element.id, Boolean(event.target.closest(".drag-handle")));
                }}
                onDragStop={(_, data) => updateElement(element.id, { x: data.x, y: data.y })}
                onResizeStop={(_, __, ref, ___, position) =>
                  updateElement(element.id, {
                    ...position,
                    width: Number.parseFloat(ref.style.width),
                    height: Number.parseFloat(ref.style.height)
                  })
                }
              >
                <button type="button" className="drag-handle" aria-label="Move element" title="Move">
                  <MiniIcon name="move" /> <span>Move</span>
                </button>

                {element.type === "text" && (
                  <div
                    className="invoice-text editable-content"
                    contentEditable
                    suppressContentEditableWarning
                    style={{ fontSize: element.fontSize, fontFamily: element.fontFamily, color: element.color }}
                    onBlur={(event) => updateElement(element.id, { text: event.currentTarget.innerText })}
                  >
                    {element.text}
                  </div>
                )}

                {element.type === "input" && (
                  <input
                    active="true"
                    name={element.name}
                    className="invoice-input active-field editable-content"
                    value={element.name}
                    placeholder={element.name || "required name"}
                    style={{ fontSize: element.fontSize, fontFamily: element.fontFamily, color: element.color }}
                    onChange={(event) => updateElement(element.id, { name: event.target.value })}
                  />
                )}

                {element.type === "image" && <img className="invoice-image" src={element.src} alt="" />}
              </Rnd>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
