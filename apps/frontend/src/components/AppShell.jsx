import { FileText, LogOut, QrCode, ReceiptText, WalletCards } from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../services/api.js";

export function AppShell() {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);

  useEffect(() => {
    api.session()
      .then((data) => {
        if (!data.authenticated) navigate("/auth", { replace: true });
        setSession(data);
      })
      .catch(() => navigate("/auth", { replace: true }));
  }, [navigate]);

  async function logout() {
    await api.logout();
    navigate("/");
  }

  if (!session?.authenticated) return <div className="page">Checking session...</div>;

  const isBusiness = session.user.role === "business";

  return (
    <div className="shell">
      <aside className="sidebar">
        <NavLink to="/" className="brand">
          <QrCode size={24} />
          <span>QR Pay</span>
        </NavLink>
        <nav>
          {isBusiness ? (
            <>
              <NavLink to="/wallets"><WalletCards size={18} />Wallets</NavLink>
              <NavLink to="/requests"><ReceiptText size={18} />Payment Requests</NavLink>
              <NavLink to="/invoices"><FileText size={18} />Invoices</NavLink>
            </>
          ) : (
            <NavLink to="/saved"><ReceiptText size={18} />Saved Invoices</NavLink>
          )}
        </nav>
        <button className="sidebar-button" onClick={logout}>
          <LogOut size={18} />Sign out
        </button>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
