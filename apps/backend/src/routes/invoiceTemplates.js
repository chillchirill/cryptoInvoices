import { Router } from "express";
import { InvoiceTemplate } from "../models/index.js";
import { asyncRoute, httpError } from "../utils/http.js";

export const invoiceTemplatesRouter = Router();

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
    attributes: ["name", "createdAt", "updatedAt"],
    order: [["updatedAt", "DESC"]]
  });

  res.json(templates.map(publicSummary));
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
