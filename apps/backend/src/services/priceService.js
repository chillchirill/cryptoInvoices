import { env } from "../config/env.js";

export async function getSolEurRate() {
  const url = `${env.coingeckoApiUrl}/simple/price?ids=solana&vs_currencies=eur`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not fetch the SOL/EUR rate");

  const data = await response.json();
  const rate = Number(data?.solana?.eur);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("CoinGecko returned an invalid rate");
  return rate;
}
