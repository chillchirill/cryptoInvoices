import crypto from "node:crypto";
import { Op } from "sequelize";
import { env } from "../config/env.js";
import { AuthSession, User } from "../models/index.js";

export function hashSessionToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getCookie(req, name = env.authCookieName) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (decodeURIComponent(rawName || "") === name) {
      return decodeURIComponent(rawValue.join("="));
    }
  }
  return "";
}

function setAuthCookie(res, token) {
  const maxAge = env.authSessionDays * 24 * 60 * 60;
  res.setHeader(
    "Set-Cookie",
    `${env.authCookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`
  );
}

export function clearAuthCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${env.authCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
  );
}

export async function createAuthSession(user, req, res) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + env.authSessionDays * 24 * 60 * 60 * 1000);

  await AuthSession.create({
    userId: user.id,
    tokenHash: hashSessionToken(token),
    userAgent: req.headers["user-agent"] || null,
    ipAddress: req.ip,
    expiresAt
  });

  setAuthCookie(res, token);
}

export async function getSessionUser(req) {
  const token = getCookie(req);
  if (!token) return null;

  const session = await AuthSession.findOne({
    where: {
      tokenHash: hashSessionToken(token),
      revokedAt: null,
      expiresAt: { [Op.gt]: new Date() }
    },
    include: [{ model: User }]
  });

  if (!session?.User) return null;
  return { session, user: session.User };
}

export async function revokeAuthSession(req, res) {
  const token = getCookie(req);
  if (token) {
    await AuthSession.update(
      { revokedAt: new Date() },
      { where: { tokenHash: hashSessionToken(token), revokedAt: null } }
    );
  }
  clearAuthCookie(res);
}
