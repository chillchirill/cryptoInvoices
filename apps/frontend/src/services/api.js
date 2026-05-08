const API_URL = import.meta.env.VITE_API_URL || "/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || "Request failed");
  }
  return response.json();
}

export const api = {
  session: () => request("/auth/session"),
  register: (payload) => request("/auth/register", { method: "POST", body: JSON.stringify(payload) }),
  login: (payload) => request("/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  logout: () => request("/auth/logout", { method: "POST", body: JSON.stringify({}) }),
  wallets: () => request("/wallets"),
  createWallet: (payload) => request("/wallets", { method: "POST", body: JSON.stringify(payload) }),
  updateWallet: (alias, payload) => request(`/wallets/${encodeURIComponent(alias)}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  }),
  deleteWallet: (alias) => request(`/wallets/${encodeURIComponent(alias)}`, { method: "DELETE" }),
  paymentRequests: () => request("/payment-requests"),
  createPaymentRequest: (payload) => request("/payment-requests", {
    method: "POST",
    body: JSON.stringify(payload)
  }),
  publicInvoice: (id) => request(`/pay/${id}`),
  saveInvoice: (id) => request(`/pay/${id}/save`, { method: "POST", body: JSON.stringify({}) }),
  solanaUrl: (id) => request(`/pay/${id}/solana-url`),
  savedInvoices: () => request("/saved-invoices"),
  invoiceTemplates: () => request("/invoice-templates"),
  invoiceTemplate: (name) => request(`/invoice-templates/${encodeURIComponent(name)}`),
  createInvoiceTemplate: (payload) => request("/invoice-templates", {
    method: "POST",
    body: JSON.stringify(payload)
  }),
  updateInvoiceTemplate: (name, payload) => request(`/invoice-templates/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  }),
  deleteInvoiceTemplate: (name) => request(`/invoice-templates/${encodeURIComponent(name)}`, {
    method: "DELETE"
  })
};
