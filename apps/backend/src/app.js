import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { authenticate, requireRole } from "./middleware/auth.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { authRouter } from "./routes/auth.js";
import { invoiceTemplatesRouter } from "./routes/invoiceTemplates.js";
import { payRouter } from "./routes/pay.js";
import { paymentRequestsRouter } from "./routes/paymentRequests.js";
import { walletsRouter } from "./routes/wallets.js";

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
  app.use("/api/invoice-templates", authenticate, requireRole("business"), invoiceTemplatesRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
