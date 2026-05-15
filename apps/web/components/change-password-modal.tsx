"use client";

import { useEffect, useState } from "react";

export function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCurrent(""); setNext(""); setConfirm(""); setError(""); setSuccess(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, saving]);

  if (!open) return null;

  async function submit() {
    if (next.length < 6) { setError("New password must be at least 6 characters."); return; }
    if (next !== confirm) { setError("New password and confirmation don't match."); return; }
    if (next === current) { setError("New password must be different from your current one."); return; }
    setSaving(true); setError("");
    const res = await fetch("/api/auth/me/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    if (res.ok) {
      setSuccess(true);
      setSaving(false);
      setTimeout(() => onClose(), 1100);
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Failed to change password.");
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => { if (!saving) onClose(); }}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-pw-title"
        onClick={e => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Close" disabled={saving}>×</button>
        <div className="modal-title" id="change-pw-title">Change password</div>
        <div className="modal-subtitle">Enter your current password, then a new one. You&apos;ll stay signed in afterwards.</div>

        <div className="form-field">
          <label className="form-label">Current password</label>
          <input
            type="password" autoFocus autoComplete="current-password"
            className="form-input" value={current}
            onChange={e => setCurrent(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") void submit(); }}
            placeholder="••••••••"
          />
        </div>

        <div className="form-field">
          <label className="form-label">New password</label>
          <input
            type="password" autoComplete="new-password"
            className="form-input" value={next}
            onChange={e => setNext(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") void submit(); }}
            placeholder="Min 6 characters"
          />
        </div>

        <div className="form-field">
          <label className="form-label">Confirm new password</label>
          <input
            type="password" autoComplete="new-password"
            className="form-input" value={confirm}
            onChange={e => setConfirm(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") void submit(); }}
            placeholder="Re-type new password"
          />
        </div>

        {error && <div className="form-error">{error}</div>}
        {success && (
          <div className="form-error" style={{ color: "var(--positive)", background: "var(--positive-dim)", borderColor: "color-mix(in oklab, var(--positive) 22%, transparent)" }}>
            ✓ Password updated.
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={() => void submit()} disabled={saving || success}>
            {saving ? "Saving…" : "Update password"}
          </button>
        </div>
      </div>
    </div>
  );
}
