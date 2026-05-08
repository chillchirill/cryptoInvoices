import { Router } from "express";
import { Wallet } from "../models/index.js";
import { assertSolanaPublicKey } from "../services/solanaService.js";
import { asyncRoute, httpError } from "../utils/http.js";

export const walletsRouter = Router();

function cleanAlias(alias) {
  const value = String(alias || "").trim();
  if (!value) throw httpError(400, "Alias is required");
  if (value.length > 80) throw httpError(400, "Alias is too long");
  return value;
}

function cleanPublicKey(publicKey) {
  const value = String(publicKey || "").trim();
  assertSolanaPublicKey(value);
  return value;
}

walletsRouter.get("/", asyncRoute(async (req, res) => {
  const wallets = await Wallet.findAll({
    where: { userId: req.user.id },
    order: [["createdAt", "DESC"]]
  });
  res.json(wallets);
}));

walletsRouter.post("/", asyncRoute(async (req, res) => {
  const alias = cleanAlias(req.body.alias);
  const publicKey = cleanPublicKey(req.body.publicKey);

  const existing = await Wallet.findOne({ where: { userId: req.user.id, alias } });
  if (existing) throw httpError(409, "A wallet with this alias already exists");

  const wallet = await Wallet.create({ userId: req.user.id, alias, publicKey });
  res.status(201).json(wallet);
}));

walletsRouter.put("/:alias", asyncRoute(async (req, res) => {
  const oldAlias = cleanAlias(req.params.alias);
  const alias = cleanAlias(req.body.alias || oldAlias);
  const publicKey = cleanPublicKey(req.body.publicKey);

  const wallet = await Wallet.findOne({ where: { userId: req.user.id, alias: oldAlias } });
  if (!wallet) throw httpError(404, "Wallet not found");

  if (alias !== oldAlias) {
    const duplicate = await Wallet.findOne({ where: { userId: req.user.id, alias } });
    if (duplicate) throw httpError(409, "The new alias is already in use");

    const nextWallet = await Wallet.create({ userId: req.user.id, alias, publicKey });
    await Wallet.destroy({ where: { userId: req.user.id, alias: oldAlias } });
    res.json(nextWallet);
    return;
  }

  await wallet.update({ publicKey });
  res.json(wallet);
}));

walletsRouter.delete("/:alias", asyncRoute(async (req, res) => {
  const alias = cleanAlias(req.params.alias);
  const deleted = await Wallet.destroy({ where: { userId: req.user.id, alias } });
  if (!deleted) throw httpError(404, "Wallet not found");
  res.json({ ok: true });
}));
