import dotenv from "dotenv";
import { resolve } from "node:path";

dotenv.config({ path: resolve(process.cwd(), "../../.env"), quiet: true });
dotenv.config({ quiet: true });

export const env = {
  appName: process.env.APP_NAME || "QR Pay",
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4000),
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  databaseUrl: process.env.DATABASE_URL || "postgres://qrpay:qrpay@localhost:5432/qrpay",
  authCookieName: process.env.AUTH_COOKIE_NAME || "qrpay_session",
  authSessionDays: Number(process.env.AUTH_SESSION_DAYS || 7),
  coingeckoApiUrl: process.env.COINGECKO_API_URL || "https://api.coingecko.com/api/v3"
};
