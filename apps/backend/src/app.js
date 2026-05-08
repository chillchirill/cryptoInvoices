import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { env } from "./config/env.js";
import { authenticate, requireRole } from "./middleware/auth.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { authRouter } from "./routes/auth.js";
import { invoicesRouter } from "./routes/invoices.js";
import { invoiceTemplatesRouter } from "./routes/invoiceTemplates.js";
import { payRouter } from "./routes/pay.js";
import { paymentRequestsRouter } from "./routes/paymentRequests.js";
import { walletsRouter } from "./routes/wallets.js";

const frontendDistPath = fileURLToPath(new URL("../../frontend/dist/", import.meta.url));
const frontendIndexPath = fileURLToPath(new URL("../../frontend/dist/index.html", import.meta.url));

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.frontendUrl, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan("dev"));

  app.get("/api/health", (req, res) => {
    res.json({ ok: true, app: env.appName });
  });

  app.use("/api/auth", authRouter);
  app.use("/api", payRouter);
  app.use("/api/wallets", authenticate, requireRole("business"), walletsRouter);
  app.use("/api/payment-requests", authenticate, requireRole("business"), paymentRequestsRouter);
  app.use("/api/invoices", authenticate, requireRole("business"), invoicesRouter);
  app.use("/api/invoice-templates", authenticate, requireRole("business"), invoiceTemplatesRouter);

  if (existsSync(frontendIndexPath)) {
    app.use(express.static(frontendDistPath));
    app.get(/^\/(?!api(?:\/|$)).*/, (req, res, next) => {
      if (req.path.includes(".")) return next();
      return res.sendFile(frontendIndexPath);
    });
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
