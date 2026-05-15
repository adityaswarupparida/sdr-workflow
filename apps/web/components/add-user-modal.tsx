"use client";

import { useEffect, useState } from "react";

type Role = "admin" | "manager" | "rep";
interface SalesRep { id: string; name: string; email: string; isActive: boolean; }

export function AddUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("manager");
  const [repId, setRepId] = useState("");
  const [reps, setReps] = useState<SalesRep[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset state + fetch reps every time the modal opens
  useEffect(() => {
    if (!open) return;
    setUsername(""); setPassword(""); setRole("manager"); setRepId(""); setError("");
    void (async () => {
      const res = await fetch("/api/reps");
      if (res.ok) setReps((await res.json()) as SalesRep[]);
    })();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, saving]);

  if (!open) return null;

  async function submit() {
    if (!username.trim() || password.length < 6) { setError("Username and a 6+ character password are required."); return; }
    if (role === "rep" && !repId) { setError("Pick which sales rep this account belongs to."); return; }
    setSaving(true); setError("");
    const body: Record<string, unknown> = { username: username.trim(), password, role };
    if (role === "rep") body["repId"] = repId;
    const res = await fetch("/api/auth/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      onClose();
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Failed to create user.");
    }
    setSaving(false);
  }

  const activeReps = reps.filter(r => r.isActive);

  return (
    <div className="modal-backdrop" onClick={() => { if (!saving) onClose(); }}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-user-title"
        onClick={e => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Close" disabled={saving}>×</button>
        <div className="modal-title" id="add-user-title">New user</div>
        <div className="modal-subtitle">
          They&apos;ll be able to sign in immediately with the credentials you set here.
        </div>

        <div className="form-field">
          <label className="form-label">Username</label>
          <input
            autoFocus autoComplete="off"
            className="form-input" value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") void submit(); }}
            placeholder="sarah.chen"
          />
        </div>

        <div className="form-field">
          <label className="form-label">Password</label>
          <input
            type="password" autoComplete="new-password"
            className="form-input" value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") void submit(); }}
            placeholder="Min 6 characters — share securely"
          />
        </div>

        <div className="form-field">
          <label className="form-label">Role</label>
          <select className="form-input" value={role} onChange={e => setRole(e.target.value as Role)}>
            <option value="manager">Manager — sees all conversations + reps</option>
            <option value="rep">Rep — sees only their own conversations</option>
            <option value="admin">Admin — manager + user management</option>
          </select>
        </div>

        {role === "rep" && (
          <div className="form-field">
            <label className="form-label">Linked sales rep</label>
            <select className="form-input" value={repId} onChange={e => setRepId(e.target.value)}>
              <option value="">Choose a rep…</option>
              {activeReps.map(r => (
                <option key={r.id} value={r.id}>{r.name} — {r.email}</option>
              ))}
            </select>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>
              Their conversations view will be scoped to whichever rep you link here.
            </div>
          </div>
        )}

        {error && <div className="form-error">{error}</div>}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={() => void submit()} disabled={saving}>
            {saving ? "Creating…" : "Create user"}
          </button>
        </div>
      </div>
    </div>
  );
}
