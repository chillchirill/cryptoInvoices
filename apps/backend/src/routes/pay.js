import { Router } from "express";
import { Transaction, SavedInvoice } from "../models/index.js";
import { optionalAuth, authenticate, requireRole } from "../middleware/auth.js";
import { getSolEurRate } from "../services/priceService.js";
import { buildSolanaPayUrl } from "../services/solanaService.js";
import { asyncRoute, httpError, parseTransactionPayload } from "../utils/http.js";

export const payRouter = Router();

async function findPaymentRequest(id) {
  const transaction = await Transaction.findByPk(id);
  if (!transaction) throw httpError(404, "Invoice not found");
  return { transaction, payload: parseTransactionPayload(transaction) };
}

function publicInvoice(transaction, payload, saved = false) {
  return {
    id: transaction.id,
    saved,
    alias: payload.alias,
    address: payload.address,
    name: payload.name,
    amountEur: payload.amountEur,
    createdAt: payload.createdAt
  };
}

payRouter.get("/pay/:id", optionalAuth, asyncRoute(async (req, res) => {
  const { transaction, payload } = await findPaymentRequest(req.params.id);
  let saved = false;

  if (req.user?.role === "client") {
    saved = Boolean(await SavedInvoice.findOne({
      where: { clientUserId: req.user.id, transactionId: transaction.id }
    }));
  }

  res.json(publicInvoice(transaction, payload, saved));
}));

payRouter.post("/pay/:id/save", authenticate, requireRole("client"), asyncRoute(async (req, res) => {
  const { transaction, payload } = await findPaymentRequest(req.params.id);
  await SavedInvoice.findOrCreate({
    where: { clientUserId: req.user.id, transactionId: transaction.id }
  });
  res.json(publicInvoice(transaction, payload, true));
}));

payRouter.get("/pay/:id/solana-url", asyncRoute(async (req, res) => {
  const { transaction, payload } = await findPaymentRequest(req.params.id);
  const label = payload.alias || "QR Pay";
  const message = payload.name || "Payment request";

  try {
    const rateEur = await getSolEurRate();
    const solAmount = (Number(payload.amountEur) / rateEur).toFixed(9);
    const url = buildSolanaPayUrl({
      address: payload.address,
      amountSol: solAmount,
      label,
      message,
      memo: transaction.id
    });
    res.json({ url, solAmount, rateEur, manualAmount: false });
  } catch (error) {
    const url = buildSolanaPayUrl({
      address: payload.address,
      label,
      message,
      memo: transaction.id
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
  const rows = await SavedInvoice.findAll({
    where: { clientUserId: req.user.id },
    include: [{ model: Transaction }],
    order: [["createdAt", "DESC"]]
  });

  res.json(rows.map((row) => publicInvoice(row.Transaction, parseTransactionPayload(row.Transaction), true)));
}));
