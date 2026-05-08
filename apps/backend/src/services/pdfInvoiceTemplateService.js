import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import sharp from "sharp";
import { httpError } from "../utils/http.js";

const PAGE_SIZE = { width: 794, height: 1123 };
const DEFAULT_TEXT_STYLE = { fontSize: 18, fontFamily: "Arial", color: "#111827" };
const REQUIRED_INPUTS = [
  { name: "money", x: 455, y: 205, width: 220, height: 38 },
  { name: "message", x: 455, y: 260, width: 220, height: 38 }
];

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function matrixBounds(matrix) {
  const transformPoint = (point) => {
    const next = [...point];
    pdfjsLib.Util.applyTransform(next, matrix);
    return next;
  };
  const points = [
    transformPoint([0, 0]),
    transformPoint([1, 0]),
    transformPoint([0, 1]),
    transformPoint([1, 1])
  ];
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys)
  };
}

function round(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
}

function normalizeTextItem(item, styles, viewport, offsetX, offsetY) {
  const text = String(item.str || "").trim();
  if (!text) return null;

  const transform = pdfjsLib.Util.transform(viewport.transform, item.transform);
  const fontSize = Math.max(8, Math.hypot(transform[2], transform[3]) || item.height || DEFAULT_TEXT_STYLE.fontSize);
  const width = Math.max(16, item.width || text.length * fontSize * 0.55);
  const height = Math.max(12, item.height || fontSize * 1.25);
  const style = styles[item.fontName] || {};
  const x = transform[4] + offsetX;
  const y = transform[5] + offsetY - height;

  return {
    type: "text",
    text,
    x: Math.max(0, x),
    y: Math.max(0, y),
    width,
    height: height * 1.15,
    fontSize: Math.round(fontSize),
    fontFamily: style.fontFamily || DEFAULT_TEXT_STYLE.fontFamily,
    color: DEFAULT_TEXT_STYLE.color
  };
}

function canMergeText(left, right) {
  if (!left || !right) return false;
  const sameLine = Math.abs(left.y - right.y) <= Math.max(3, left.fontSize * 0.35);
  const sameStyle = left.fontFamily === right.fontFamily && Math.abs(left.fontSize - right.fontSize) <= 1;
  const gap = right.x - (left.x + left.width);
  return sameLine && sameStyle && gap >= -2 && gap <= Math.max(24, left.fontSize * 1.5);
}

function mergeTextItems(items) {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const merged = [];

  for (const item of sorted) {
    const previous = merged.at(-1);
    if (canMergeText(previous, item)) {
      const gap = item.x - (previous.x + previous.width);
      previous.text = `${previous.text}${gap > previous.fontSize * 0.25 ? " " : ""}${item.text}`;
      previous.width = Math.max(previous.width, item.x + item.width - previous.x);
      previous.height = Math.max(previous.height, item.height);
      continue;
    }
    merged.push({ ...item });
  }

  return merged;
}

async function getPdfObject(objs, name) {
  if (objs.has(name)) return objs.get(name);
  return new Promise((resolve) => objs.get(name, resolve));
}

async function imageDataToPngDataUrl(image) {
  if (!image?.data || !image.width || !image.height) return null;

  const kind = image.kind;
  const channels = kind === pdfjsLib.ImageKind.RGBA_32BPP
    ? 4
    : kind === pdfjsLib.ImageKind.RGB_24BPP
      ? 3
      : null;

  if (!channels) return null;

  const png = await sharp(Buffer.from(image.data), {
    raw: { width: image.width, height: image.height, channels }
  }).png().toBuffer();

  return `data:image/png;base64,${png.toString("base64")}`;
}

async function extractImages(page, viewport, offsetX, offsetY, warnings) {
  const operatorList = await page.getOperatorList();
  const images = [];
  const matrixStack = [];
  let currentMatrix = [1, 0, 0, 1, 0, 0];

  for (let index = 0; index < operatorList.fnArray.length; index += 1) {
    const fn = operatorList.fnArray[index];
    const args = operatorList.argsArray[index] || [];

    if (fn === pdfjsLib.OPS.save) {
      matrixStack.push([...currentMatrix]);
      continue;
    }
    if (fn === pdfjsLib.OPS.restore) {
      currentMatrix = matrixStack.pop() || [1, 0, 0, 1, 0, 0];
      continue;
    }
    if (fn === pdfjsLib.OPS.transform) {
      currentMatrix = pdfjsLib.Util.transform(currentMatrix, args);
      continue;
    }

    const isNamedImage = fn === pdfjsLib.OPS.paintImageXObject || fn === pdfjsLib.OPS.paintJpegXObject;
    const isInlineImage = fn === pdfjsLib.OPS.paintInlineImageXObject;
    if (!isNamedImage && !isInlineImage) continue;

    const image = isNamedImage ? await getPdfObject(page.objs, args[0]) : args[0];
    const src = await imageDataToPngDataUrl(image);
    if (!src) {
      warnings.push("A PDF image could not be decoded as a separate editable image.");
      continue;
    }

    const imageMatrix = pdfjsLib.Util.transform(viewport.transform, currentMatrix);
    const bounds = matrixBounds(imageMatrix);
    images.push({
      type: "image",
      src,
      x: Math.max(0, bounds.left + offsetX),
      y: Math.max(0, bounds.top + offsetY),
      width: Math.max(1, bounds.width),
      height: Math.max(1, bounds.height)
    });
  }

  return images;
}

function inlineStyle(element) {
  if (element.type === "image") {
    return [
      "position:absolute",
      `left:${round(element.x)}px`,
      `top:${round(element.y)}px`,
      `width:${round(element.width, 1)}px`,
      `height:${round(element.height, 1)}px`,
      "object-fit:contain",
      "box-sizing:border-box"
    ].join(";");
  }

  const common = [
    "position:absolute",
    `left:${round(element.x)}px`,
    `top:${round(element.y)}px`,
    `width:${round(element.width, 1)}px`,
    `height:${round(element.height, 1)}px`,
    `font-size:${round(element.fontSize, DEFAULT_TEXT_STYLE.fontSize)}px`,
    `font-family:${element.fontFamily || DEFAULT_TEXT_STYLE.fontFamily}`,
    `color:${element.color || DEFAULT_TEXT_STYLE.color}`,
    "box-sizing:border-box"
  ];

  if (element.type === "input") {
    common.push("border:1px solid #2563eb", "background:rgba(37,99,235,0.08)", "padding:6px 8px");
  } else {
    common.push("white-space:pre-wrap", "overflow:hidden");
  }

  return common.join(";");
}

function elementToHtml(element) {
  const style = inlineStyle(element);
  if (element.type === "input") {
    return `<input active="true" name="${escapeHtml(element.name)}" class="invoice-input active-field" value="${escapeHtml(element.name)}" style="${style}">`;
  }
  if (element.type === "image") {
    return `<img class="invoice-image" src="${escapeHtml(element.src)}" alt="" style="${style}">`;
  }
  return `<div class="invoice-text" style="${style}">${escapeHtml(element.text)}</div>`;
}

function elementsToHtml(elements) {
  return `<div class="invoice-page" style="position:relative;width:${PAGE_SIZE.width}px;height:${PAGE_SIZE.height}px;background:#ffffff;box-sizing:border-box;overflow:hidden;">
  ${elements.map(elementToHtml).join("\n  ")}
</div>`;
}

export async function extractInvoiceTemplateFromPdf(pdfBuffer) {
  const warnings = [];
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    disableFontFace: true,
    useSystemFonts: true
  });

  let document;
  try {
    document = await loadingTask.promise;
  } catch {
    throw httpError(400, "The uploaded file is not a readable PDF");
  }

  if (!document.numPages) throw httpError(400, "The uploaded PDF has no pages");
  if (document.numPages > 1) warnings.push("Only the first PDF page was imported.");

  const page = await document.getPage(1);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(PAGE_SIZE.width / baseViewport.width, PAGE_SIZE.height / baseViewport.height);
  const viewport = page.getViewport({ scale });
  const offsetX = (PAGE_SIZE.width - viewport.width) / 2;
  const offsetY = (PAGE_SIZE.height - viewport.height) / 2;

  const textContent = await page.getTextContent({ normalizeWhitespace: true });
  const textElements = mergeTextItems(
    textContent.items
      .map((item) => normalizeTextItem(item, textContent.styles, viewport, offsetX, offsetY))
      .filter(Boolean)
  );

  if (!textElements.length) {
    throw httpError(400, "No editable text could be extracted from the first PDF page");
  }

  const imageElements = await extractImages(page, viewport, offsetX, offsetY, warnings);
  const inputElements = REQUIRED_INPUTS.map((input) => ({
    type: "input",
    ...input,
    ...DEFAULT_TEXT_STYLE,
    fontSize: 16
  }));

  const html = elementsToHtml([...imageElements, ...textElements, ...inputElements]);
  if (html.length > 500_000) {
    throw httpError(400, "Extracted template HTML is too large. Try a smaller PDF or fewer embedded images.");
  }

  await document.destroy();
  return { html, warnings };
}
