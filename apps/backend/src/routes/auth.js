import { Router } from "express";
import { User } from "../models/index.js";
import { hashPassword, verifyPassword } from "../services/passwordService.js";
import { createAuthSession, getSessionUser, revokeAuthSession } from "../services/sessionService.js";
import { asyncRoute, httpError, normalizeEmail } from "../utils/http.js";

export const authRouter = Router();

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt
  };
}

function validatePassword(password) {
  if (String(password || "").length < 8) {
    throw httpError(400, "Password must be at least 8 characters");
  }
}

authRouter.get("/session", asyncRoute(async (req, res) => {
  const auth = await getSessionUser(req);
  res.json({ authenticated: Boolean(auth?.user), user: publicUser(auth?.user) });
}));

authRouter.post("/register", asyncRoute(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");
  const role = req.body.role === "client" ? "client" : "business";

  if (!email) throw httpError(400, "Email is required");
  validatePassword(password);

  const existing = await User.findOne({ where: { email } });
  if (existing) throw httpError(409, "A user with this email already exists");

  const user = await User.create({
    email,
    passwordHash: await hashPassword(password),
    role
  });
  await createAuthSession(user, req, res);
  res.status(201).json({ user: publicUser(user) });
}));

authRouter.post("/login", asyncRoute(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");
  const user = await User.findOne({ where: { email } });
  const valid = await verifyPassword(password, user?.passwordHash);

  if (!user || !valid) throw httpError(401, "Invalid email or password");

  await createAuthSession(user, req, res);
  res.json({ user: publicUser(user) });
}));

authRouter.post("/logout", asyncRoute(async (req, res) => {
  await revokeAuthSession(req, res);
  res.json({ ok: true });
}));
