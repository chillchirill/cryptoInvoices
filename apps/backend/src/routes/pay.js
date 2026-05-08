import { Router } from "express";
import { Invoice, Transaction, SavedInvoice } from "../models/index.js";
import { optionalAuth, authenticate, requireRole } from "../middleware/auth.js";
import { getSolEurRate } from "../services/priceService.js";
import { buildSolanaPayUrl } from "../services/solanaService.js";
import { asyncRoute, httpError, parseTransactionPayload } from "../utils/http.js";

export const payRouter = Router();

async function findPaymentRequest(id) {
  const invoice = await Invoice.findByPk(id);
  if (invoice) return { invoice };

  const transaction = await Transaction.findByPk(id);
  if (!transaction) throw httpError(404, "Invoice not found");
  return { transaction, payload: parseTransactionPayload(transaction) };
}

function publicStoredInvoice(invoice, saved = false) {
  return {
    id: invoice.id,
    saved,
    alias: invoice.walletAlias,
    address: invoice.walletAddress,
    templateName: invoice.templateName,
    templateHtml: invoice.templateHtml,
    fieldValues: invoice.fieldValues || {},
    createdAt: invoice.createdAt
  };
}

function publicLegacyInvoice(transaction, payload, saved = false) {
  return {
    id: transaction.id,
    saved,
    alias: payload.alias,
    address: payload.address,
    name: payload.name,
    displayName: payload.displayName || payload.name,
    amountEur: payload.amountEur,
    fieldValues: payload.fields || {},
    templateName: payload.templateName || null,
    createdAt: payload.createdAt
  };
}

async function attachInvoiceToClient(invoice, user) {
  if (!invoice || user?.role !== "client") return false;
  if (!invoice.receiverUserId) {
    await invoice.update({ receiverUserId: user.id });
    return true;
  }
  return invoice.receiverUserId === user.id;
}

payRouter.get("/pay/:id", optionalAuth, asyncRoute(async (req, res) => {
  const { invoice, transaction, payload } = await findPaymentRequest(req.params.id);

  if (invoice) {
    const saved = await attachInvoiceToClient(invoice, req.user);
    res.json(publicStoredInvoice(invoice, saved));
    return;
  }

  let saved = false;
  if (req.user?.role === "client") {
    saved = Boolean(await SavedInvoice.findOne({
      where: { clientUserId: req.user.id, transactionId: transaction.id }
    }));
  }

  res.json(publicLegacyInvoice(transaction, payload, saved));
}));

payRouter.post("/pay/:id/save", authenticate, requireRole("client"), asyncRoute(async (req, res) => {
  const { invoice, transaction, payload } = await findPaymentRequest(req.params.id);

  if (invoice) {
    if (invoice.receiverUserId && invoice.receiverUserId !== req.user.id) {
      throw httpError(409, "Invoice is already saved by another client");
    }
    const saved = await attachInvoiceToClient(invoice, req.user);
    res.json(publicStoredInvoice(invoice, saved));
    return;
  }

  await SavedInvoice.findOrCreate({
    where: { clientUserId: req.user.id, transactionId: transaction.id }
  });
  res.json(publicLegacyInvoice(transaction, payload, true));
}));

payRouter.get("/pay/:id/solana-url", asyncRoute(async (req, res) => {
  const { invoice, transaction, payload } = await findPaymentRequest(req.params.id);
  const payment = invoice
    ? {
        id: invoice.id,
        address: invoice.walletAddress,
        alias: invoice.walletAlias,
        name: invoice.fieldValues?.message || invoice.templateName,
        amountEur: invoice.fieldValues?.money
      }
    : { id: transaction.id, ...payload };
  const label = payment.alias || "QR Pay";
  const message = payment.name || payment.displayName || "Payment request";
  const amountEur = Number(payment.amountEur);

  try {
    const rateEur = await getSolEurRate();
    if (!Number.isFinite(amountEur) || amountEur <= 0) {
      throw new Error("Payment amount is not set");
    }
    const solAmount = (amountEur / rateEur).toFixed(9);
    const url = buildSolanaPayUrl({
      address: payment.address,
      amountSol: solAmount,
      label,
      message,
      memo: payment.id
    });
    res.json({ url, solAmount, rateEur, manualAmount: false });
  } catch (error) {
    const url = buildSolanaPayUrl({
      address: payment.address,
      label,
      message,
      memo: payment.id
    });
    res.json({
      url,
      solAmount: null,
      rateEur: null,
      manualAmount: true,
      warning: "Could not fetch the SOL/EUR rate. Enter the amount manually."
    });
  }
}));

payRouter.get("/saved-invoices", authenticate, requireRole("client"), asyncRoute(async (req, res) => {
  const invoices = await Invoice.findAll({
    where: { receiverUserId: req.user.id },
    order: [["createdAt", "DESC"]]
  });

  const legacyRows = await SavedInvoice.findAll({
    where: { clientUserId: req.user.id },
    include: [{ model: Transaction }],
    order: [["createdAt", "DESC"]]
  });

  const invoiceIds = new Set(invoices.map((invoice) => invoice.id));
  const legacyInvoices = legacyRows
    .filter((row) => row.Transaction && !invoiceIds.has(row.Transaction.id))
    .map((row) => publicLegacyInvoice(row.Transaction, parseTransactionPayload(row.Transaction), true));

  const result = [
    ...invoices.map((invoice) => publicStoredInvoice(invoice, true)),
    ...legacyInvoices
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json(result);
}));
