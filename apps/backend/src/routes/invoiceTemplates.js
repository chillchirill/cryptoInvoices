import { Router } from "express";
import multer from "multer";
import { InvoiceTemplate } from "../models/index.js";
import { extractInvoiceTemplateFromPdf } from "../services/pdfInvoiceTemplateService.js";
import { extractActiveFields, missingRequiredInvoiceFields } from "../utils/invoiceFields.js";
import { asyncRoute, httpError } from "../utils/http.js";

export const invoiceTemplatesRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

function uploadPdf(req, res, next) {
  upload.single("pdf")(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError) {
      next(httpError(400, error.code === "LIMIT_FILE_SIZE" ? "PDF file is too large" : error.message));
      return;
    }

    next(error);
  });
}

function cleanName(value) {
  const name = String(value || "").trim();
  if (!name) throw httpError(400, "Template name is required");
  if (name.length > 120) throw httpError(400, "Template name is too long");
  return name;
}

function validateHtml(html) {
  const value = String(html || "").trim();
  if (!value) throw httpError(400, "Template HTML is required");
  if (value.length > 500_000) throw httpError(400, "Template HTML is too large");

  const checks = [
    [/<\s*script\b/i, "HTML cannot contain script tags"],
    [/\son[a-z]+\s*=/i, "HTML cannot contain inline event handlers"],
    [/javascript\s*:/i, "HTML cannot contain javascript: URLs"]
  ];

  for (const [pattern, message] of checks) {
    if (pattern.test(value)) throw httpError(400, message);
  }

  const missing = missingRequiredInvoiceFields(extractActiveFields(value));
  if (missing.length) throw httpError(400, `Template must include active inputs: ${missing.join(", ")}`);

  return value;
}

async function nextTemplateName(userId) {
  const base = "Invoice template";
  let candidate = base;
  let index = 2;

  while (await InvoiceTemplate.findOne({ where: { userId, name: candidate } })) {
    candidate = `${base} ${index}`;
    index += 1;
  }

  return candidate;
}

function publicSummary(template) {
  return {
    name: template.name,
    activeFields: extractActiveFields(template.html),
    updatedAt: template.updatedAt,
    createdAt: template.createdAt
  };
}

function publicTemplate(template) {
  return {
    ...publicSummary(template),
    html: template.html
  };
}

invoiceTemplatesRouter.get("/", asyncRoute(async (req, res) => {
  const templates = await InvoiceTemplate.findAll({
    where: { userId: req.user.id },
    attributes: ["name", "html", "createdAt", "updatedAt"],
    order: [["updatedAt", "DESC"]]
  });

  res.json(templates.map(publicSummary));
}));

invoiceTemplatesRouter.post("/extract-pdf", uploadPdf, asyncRoute(async (req, res) => {
  const file = req.file;
  if (!file) throw httpError(400, "PDF file is required");
  const isPdf = file.mimetype === "application/pdf" || /\.pdf$/i.test(file.originalname || "");
  if (!isPdf) throw httpError(400, "Only PDF files can be extracted");

  const result = await extractInvoiceTemplateFromPdf(file.buffer);
  res.json(result);
}));

invoiceTemplatesRouter.get("/:name", asyncRoute(async (req, res) => {
  const name = cleanName(req.params.name);
  const template = await InvoiceTemplate.findOne({ where: { userId: req.user.id, name } });
  if (!template) throw httpError(404, "Template not found");
  res.json(publicTemplate(template));
}));

invoiceTemplatesRouter.post("/", asyncRoute(async (req, res) => {
  const html = validateHtml(req.body.html);
  const name = req.body.name ? cleanName(req.body.name) : await nextTemplateName(req.user.id);

  const existing = await InvoiceTemplate.findOne({ where: { userId: req.user.id, name } });
  if (existing) throw httpError(409, "A template with this name already exists");

  const template = await InvoiceTemplate.create({ userId: req.user.id, name, html });
  res.status(201).json(publicTemplate(template));
}));

invoiceTemplatesRouter.put("/:name", asyncRoute(async (req, res) => {
  const currentName = cleanName(req.params.name);
  const html = validateHtml(req.body.html);
  const nextName = req.body.name ? cleanName(req.body.name) : currentName;

  const template = await InvoiceTemplate.findOne({ where: { userId: req.user.id, name: currentName } });
  if (!template) throw httpError(404, "Template not found");

  if (nextName !== currentName) {
    const duplicate = await InvoiceTemplate.findOne({ where: { userId: req.user.id, name: nextName } });
    if (duplicate) throw httpError(409, "The new name is already in use");

    const nextTemplate = await InvoiceTemplate.create({ userId: req.user.id, name: nextName, html });
    await InvoiceTemplate.destroy({ where: { userId: req.user.id, name: currentName } });
    res.json(publicTemplate(nextTemplate));
    return;
  }

  await template.update({ html });
  res.json(publicTemplate(template));
}));

invoiceTemplatesRouter.delete("/:name", asyncRoute(async (req, res) => {
  const name = cleanName(req.params.name);
  const deleted = await InvoiceTemplate.destroy({ where: { userId: req.user.id, name } });
  if (!deleted) throw httpError(404, "Template not found");
  res.json({ ok: true });
}));
