import { ArrowRight, Building2, UserRound, WalletCards } from "lucide-react";
import { Link } from "react-router-dom";

export function LandingPage() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <strong>QR Pay</strong>
        <nav>
          <Link to="/auth">Sign in</Link>
          <Link className="button primary" to="/auth?mode=register&role=business">Register</Link>
        </nav>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">Solana QR payments</p>
          <h1>Create QR invoices for wallet payments.</h1>
          <p>
            Businesses add a Solana address, create a EUR payment request, and clients scan the QR
            to open the invoice and pay from their wallet.
          </p>
          <div className="hero-actions">
            <Link className="button primary" to="/auth?mode=register&role=business">
              I am a business <ArrowRight size={18} />
            </Link>
            <Link className="button secondary" to="/auth?mode=register&role=client">
              I am a client
            </Link>
          </div>
        </div>
        <div className="dashboard-preview" aria-label="Payment preview">
          <div className="preview-top">
            <span>New QR</span>
            <strong>EUR 125.00</strong>
          </div>
          <div className="preview-grid">
            <span>Wallet</span><b>main-sol</b><strong>Solana</strong>
            <span>Endpoint</span><b>/pay/x7K...</b><strong>QR ready</strong>
            <span>Payment</span><b>EUR to SOL</b><strong>Live rate</strong>
          </div>
        </div>
      </section>

      <section className="use-cases">
        <article><Building2 /><h2>Business</h2><p>Save wallet addresses and create QR payment requests.</p></article>
        <article><UserRound /><h2>Client</h2><p>Scan an invoice, pay it, and save it to an account.</p></article>
        <article><WalletCards /><h2>Solana</h2><p>The payment button opens an installed wallet on mobile.</p></article>
      </section>
    </div>
  );
}
