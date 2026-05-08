import { nanoid } from "nanoid";
import { Router } from "express";
import { sequelize } from "../db/sequelize.js";
import { Invoice, InvoiceTemplate, Transaction, Wallet } from "../models/index.js";
import { extractActiveFields, missingRequiredInvoiceFields } from "../utils/invoiceFields.js";
import { asyncRoute, httpError, parseAmount, parseTransactionPayload } from "../utils/http.js";

export const paymentRequestsRouter = Router();

function publicPaymentRequest(transaction) {
  const payload = parseTransactionPayload(transaction);
  return {
    id: transaction.id,
    ...payload,
    createdAt: transaction.createdAt
  };
}

function normalizeFields(activeFields, values) {
  const source = values && typeof values === "object" ? values : {};
  const normalized = {};

  for (const field of activeFields) {
    const value = String(source[field.name] ?? "").trim();
    normalized[field.name] = value;
  }

  return normalized;
}

async function createTemplatedRequest(req, wallet) {
  const templateName = String(req.body.templateName || "").trim();
  if (!templateName) throw httpError(400, "Select an invoice template");

  const template = await InvoiceTemplate.findOne({ where: { userId: req.user.id, name: templateName } });
  if (!template) throw httpError(404, "Template not found");

  const activeFields = extractActiveFields(template.html);
  if (!activeFields.length) throw httpError(400, "Template has no active fields");
  const missing = missingRequiredInvoiceFields(activeFields);
  if (missing.length) throw httpError(400, `Template must include active inputs: ${missing.join(", ")}`);

  const fields = normalizeFields(activeFields, req.body.fields);
  const money = parseAmount(fields.money);
  if (!fields.message) throw httpError(400, "message is required");
  fields.money = money.toFixed(2);
  const id = nanoid(14);

  const payload = {
    alias: wallet.alias,
    businessUserId: req.user.id,
    address: wallet.publicKey,
    templateName: template.name,
    fields,
    createdAt: new Date().toISOString()
  };

  const transaction = await sequelize.transaction(async (dbTransaction) => {
    const createdTransaction = await Transaction.create({
      id,
      payloadText: JSON.stringify(payload)
    }, { transaction: dbTransaction });

    await Invoice.create({
      id,
      senderUserId: req.user.id,
      receiverUserId: null,
      walletAlias: wallet.alias,
      walletAddress: wallet.publicKey,
      templateName: template.name,
      templateHtml: template.html,
      fieldValues: fields
    }, { transaction: dbTransaction });

    return createdTransaction;
  });

  return publicPaymentRequest(transaction);
}

paymentRequestsRouter.get("/", asyncRoute(async (req, res) => {
  const requests = await Transaction.findAll({ order: [["createdAt", "DESC"]] });
  res.json(
    requests
      .map(publicPaymentRequest)
      .filter((request) => request.businessUserId === req.user.id)
  );
}));

paymentRequestsRouter.post("/", asyncRoute(async (req, res) => {
  const walletAlias = String(req.body.walletAlias || "").trim();

  if (!walletAlias) throw httpError(400, "Select a wallet");

  const wallet = await Wallet.findOne({ where: { userId: req.user.id, alias: walletAlias } });
  if (!wallet) throw httpError(404, "Wallet not found");

  if (req.body.templateName) {
    const request = await createTemplatedRequest(req, wallet);
    res.status(201).json(request);
    return;
  }

  const name = String(req.body.name || "").trim();
  const amountEur = parseAmount(req.body.amountEur);
  if (!name) throw httpError(400, "Name is required");

  const payload = {
    alias: wallet.alias,
    businessUserId: req.user.id,
    address: wallet.publicKey,
    name,
    amountEur: amountEur.toFixed(2),
    createdAt: new Date().toISOString()
  };

  const transaction = await Transaction.create({
    id: nanoid(14),
    payloadText: JSON.stringify(payload)
  });

  res.status(201).json(publicPaymentRequest(transaction));
}));
