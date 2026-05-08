import { getSessionUser } from "../services/sessionService.js";

export async function optionalAuth(req, res, next) {
  try {
    const auth = await getSessionUser(req);
    req.user = auth?.user || null;
    req.authSession = auth?.session || null;
    next();
  } catch (error) {
    next(error);
  }
}

export async function authenticate(req, res, next) {
  try {
    const auth = await getSessionUser(req);
    if (!auth?.user) return res.status(401).json({ error: "Authentication required" });

    req.user = auth.user;
    req.authSession = auth.session;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) return res.status(403).json({ error: "Insufficient permissions" });
    next();
  };
}
