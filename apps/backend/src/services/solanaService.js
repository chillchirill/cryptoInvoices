import { PublicKey } from "@solana/web3.js";

export function assertSolanaPublicKey(value) {
  try {
    return new PublicKey(String(value || "").trim());
  } catch {
    const error = new Error("Invalid Solana address");
    error.status = 400;
    throw error;
  }
}

export function buildSolanaPayUrl({ address, amountSol, label, message, memo }) {
  const recipient = assertSolanaPublicKey(address);
  const params = new URLSearchParams();
  if (amountSol) params.set("amount", Number(amountSol).toString());
  if (label) params.set("label", label);
  if (message) params.set("message", message);
  if (memo) params.set("memo", memo);

  const query = params.toString();
  return `solana:${recipient.toBase58()}${query ? `?${query}` : ""}`;
}
