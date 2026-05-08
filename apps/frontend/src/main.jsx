import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell.jsx";
import { AuthPage } from "./pages/AuthPage.jsx";
import { InvoicesPage } from "./pages/InvoicesPage.jsx";
import { LandingPage } from "./pages/LandingPage.jsx";
import { PayPage } from "./pages/PayPage.jsx";
import { PaymentRequestsPage } from "./pages/PaymentRequestsPage.jsx";
import { SavedInvoicesPage } from "./pages/SavedInvoicesPage.jsx";
import { WalletsPage } from "./pages/WalletsPage.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/pay/:id" element={<PayPage />} />
        <Route element={<AppShell />}>
          <Route path="/wallets" element={<WalletsPage />} />
          <Route path="/requests" element={<PaymentRequestsPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/saved" element={<SavedInvoicesPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
