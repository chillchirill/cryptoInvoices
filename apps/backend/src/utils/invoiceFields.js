function decodeHtmlAttribute(value = "") {
  return String(value)
    .replaceAll("&quot;", '"')
    .replaceAll("&#34;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function parseAttributes(inputTag) {
  const attrs = {};
  const pattern = /([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;

  while ((match = pattern.exec(inputTag))) {
    const key = match[1].toLowerCase();
    if (key === "input") continue;
    attrs[key] = decodeHtmlAttribute(match[2] ?? match[3] ?? match[4] ?? "");
  }

  return attrs;
}

function hasClass(attrs, className) {
  return String(attrs.class || "")
    .split(/\s+/)
    .some((item) => item.toLowerCase() === className);
}

function isActiveInput(attrs) {
  return (
    String(attrs.active || "").toLowerCase() === "true" ||
    String(attrs["data-active"] || "").toLowerCase() === "true" ||
    hasClass(attrs, "active-field") ||
    hasClass(attrs, "invoice-input")
  );
}

export function extractActiveFields(html) {
  const inputTags = String(html || "").match(/<input\b[^>]*>/gi) || [];
  const seen = new Set();
  const fields = [];

  for (const inputTag of inputTags) {
    const attrs = parseAttributes(inputTag);
    if (!isActiveInput(attrs)) continue;

    const name = String(attrs.name || attrs["data-name"] || attrs.value || "").trim();
    if (!name || seen.has(name)) continue;

    seen.add(name);
    fields.push({ name });
  }

  return fields;
}

export const REQUIRED_INVOICE_FIELDS = ["money", "message"];

export function missingRequiredInvoiceFields(fields) {
  const names = new Set(fields.map((field) => field.name));
  return REQUIRED_INVOICE_FIELDS.filter((name) => !names.has(name));
}

export function humanizeFieldName(name) {
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
