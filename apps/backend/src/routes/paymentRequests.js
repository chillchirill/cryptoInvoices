import { nanoid } from "nanoid";
import { Router } from "express";
import { Transaction, Wallet } from "../models/index.js";
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
  const name = String(req.body.name || "").trim();
  const amountEur = parseAmount(req.body.amountEur);

  if (!walletAlias) throw httpError(400, "Select a wallet");
  if (!name) throw httpError(400, "Name is required");

  const wallet = await Wallet.findOne({ where: { userId: req.user.id, alias: walletAlias } });
  if (!wallet) throw httpError(404, "Wallet not found");

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
