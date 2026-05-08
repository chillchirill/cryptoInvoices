import { Edit2, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../services/api.js";

const emptyForm = { alias: "", publicKey: "" };

export function WalletsPage() {
  const [wallets, setWallets] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingAlias, setEditingAlias] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setWallets(await api.wallets());
  }

  useEffect(() => { load().catch((err) => setError(err.message)); }, []);

  function edit(wallet) {
    setEditingAlias(wallet.alias);
    setForm({ alias: wallet.alias, publicKey: wallet.publicKey });
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      if (editingAlias) {
        await api.updateWallet(editingAlias, form);
      } else {
        await api.createWallet(form);
      }
      setForm(emptyForm);
      setEditingAlias("");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(alias) {
    await api.deleteWallet(alias);
    await load();
  }

  return (
    <div className="page">
      <div className="page-title">
        <div><h1>Wallets</h1><p className="muted">Add a Solana public key and a short alias.</p></div>
      </div>

      <form className="card inline-form" onSubmit={submit}>
        <label>Alias<input value={form.alias} onChange={(event) => setForm({ ...form, alias: event.target.value })} required /></label>
        <label className="grow">Public key<input value={form.publicKey} onChange={(event) => setForm({ ...form, publicKey: event.target.value })} required /></label>
        <button className="button primary"><Plus size={18} />{editingAlias ? "Save" : "Add"}</button>
      </form>

      {error && <p className="error-box">{error}</p>}

      <div className="card">
        <table>
          <thead><tr><th>Alias</th><th>Address</th><th></th></tr></thead>
          <tbody>
            {wallets.map((wallet) => (
              <tr key={wallet.alias}>
                <td><strong>{wallet.alias}</strong></td>
                <td className="mono">{wallet.publicKey}</td>
                <td className="row-actions">
                  <button className="icon-button" onClick={() => edit(wallet)} title="Edit"><Edit2 size={16} /></button>
                  <button className="icon-button danger" onClick={() => remove(wallet.alias)} title="Delete"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
            {!wallets.length && <tr><td colSpan="3" className="muted">No wallets yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
