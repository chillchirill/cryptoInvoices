export function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function parseAmount(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw httpError(400, "Amount must be greater than 0");
  return number;
}

export function parseTransactionPayload(transaction) {
  return JSON.parse(transaction.payloadText);
}
