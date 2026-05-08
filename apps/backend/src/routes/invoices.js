import { Router } from "express";
import { Invoice, Transaction } from "../models/index.js";
import { asyncRoute, parseTransactionPayload } from "../utils/http.js";

export const invoicesRouter = Router();

function invoiceTitle(createdAt) {
  const date = new Date(createdAt);
  const formatted = Number.isNaN(date.getTime())
    ? String(createdAt || "")
    : date.toISOString().slice(0, 16).replace("T", " ");
  return `Invoice - ${formatted}`;
}

function publicStoredInvoice(invoice) {
  return {
    id: invoice.id,
    title: invoiceTitle(invoice.createdAt),
    alias: invoice.walletAlias,
    address: invoice.walletAddress,
    templateName: invoice.templateName,
    templateHtml: invoice.templateHtml,
    fieldValues: invoice.fieldValues || {},
    createdAt: invoice.createdAt
  };
}

function publicLegacyInvoice(transaction, payload) {
  const createdAt = payload.createdAt || transaction.createdAt;
  return {
    id: transaction.id,
    title: invoiceTitle(createdAt),
    alias: payload.alias,
    address: payload.address,
    name: payload.name,
    displayName: payload.displayName || payload.name,
    amountEur: payload.amountEur,
    fieldValues: payload.fields || {},
    templateName: payload.templateName || null,
    templateHtml: null,
    createdAt
  };
}

invoicesRouter.get("/", asyncRoute(async (req, res) => {
  const invoices = await Invoice.findAll({
    where: { senderUserId: req.user.id },
    order: [["createdAt", "DESC"]]
  });

  const invoiceIds = new Set(invoices.map((invoice) => invoice.id));
  const legacyRows = await Transaction.findAll({ order: [["createdAt", "DESC"]] });
  const legacyInvoices = legacyRows
    .map((transaction) => ({ transaction, payload: parseTransactionPayload(transaction) }))
    .filter(({ transaction, payload }) => payload.businessUserId === req.user.id && !invoiceIds.has(transaction.id))
    .map(({ transaction, payload }) => publicLegacyInvoice(transaction, payload));

  const result = [
    ...invoices.map(publicStoredInvoice),
    ...legacyInvoices
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json(result);
}));
