"use client";

import { useEffect, useState, useCallback } from "react";

type Role = "manager" | "rep";

interface SalesRep { id: string; name: string; email: string; isActive: boolean; createdAt: string; }

function initials(name: string) {
  return name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);
}

function timeAgo(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function Sidebar({ role, onRoleChange }: { role: Role; onRoleChange: (r: Role) => void }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">SDR</div>
        <div className="sidebar-logo-text">Agent</div>
      </div>
      <nav className="sidebar-nav">
        <span className="sidebar-section-label">Workspace</span>
        <a href="/" className="sidebar-link">
          <span className="sidebar-link-icon">◈</span>
          Conversations
        </a>
        <a href="/reps" className="sidebar-link active">
          <span className="sidebar-link-icon">◎</span>
          Sales Reps
        </a>
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-bottom-label">View As</div>
        <div className="role-toggle">
          <button className={`role-btn${role === "manager" ? " active" : ""}`} onClick={() => onRoleChange("manager")}>Manager</button>
          <button className={`role-btn${role === "rep" ? " active" : ""}`} onClick={() => onRoleChange("rep")}>Rep</button>
        </div>
      </div>
    </aside>
  );
}

// ── Add Rep Modal ──────────────────────────────────────────────────────────────

function AddRepModal({
  open, onClose, name, email, error, saving, onName, onEmail, onSave,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  email: string;
  error: string;
  saving: boolean;
  onName: (v: string) => void;
  onEmail: (v: string) => void;
  onSave: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-rep-title"
        onClick={e => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <div className="modal-title" id="add-rep-title">New Sales Representative</div>
        <div className="modal-subtitle">
          Active reps join the round-robin pool — they&apos;re auto-assigned to inbound emails and CC&apos;d on every reply.
        </div>

        <div className="form-field">
          <label className="form-label">Full Name</label>
          <input
            className="form-input" value={name} autoFocus
            onChange={e => onName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") onSave(); }}
            placeholder="Sarah Chen"
          />
        </div>

        <div className="form-field">
          <label className="form-label">Work Email</label>
          <input
            type="email" className="form-input" value={email}
            onChange={e => onEmail(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") onSave(); }}
            placeholder="sarah@yourcompany.com"
          />
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={onSave} disabled={saving}>
            {saving ? "Adding…" : "Create Rep"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function RepsPage() {
  const [reps, setReps] = useState<SalesRep[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [role, setRole] = useState<Role>("manager");
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    const r = localStorage.getItem("sdr-role") as Role | null;
    if (r) setRole(r);
  }, []);

  const handleRole = (r: Role) => { setRole(r); localStorage.setItem("sdr-role", r); };

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetch("/api/reps").then(r => r.json()) as SalesRep[];
    setReps(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  function openAdd() {
    setName(""); setEmail(""); setError("");
    setShowAdd(true);
  }

  function closeAdd() {
    if (saving) return;
    setShowAdd(false);
  }

  async function addRep() {
    if (!name.trim() || !email.trim()) { setError("Name and email are required."); return; }
    setSaving(true); setError("");
    const res = await fetch("/api/reps", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), email: email.trim() }),
    });
    if (res.ok) {
      setName(""); setEmail("");
      setShowAdd(false);
      await load();
    } else {
      setError("Failed. Email may already exist.");
    }
    setSaving(false);
  }

  async function toggle(rep: SalesRep) {
    await fetch(`/api/reps/${rep.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !rep.isActive }),
    });
    await load();
  }

  async function remove(id: string) {
    await fetch(`/api/reps/${id}`, { method: "DELETE" });
    await load();
  }

  const active   = reps.filter(r => r.isActive);
  const inactive = reps.filter(r => !r.isActive);

  return (
    <div className="shell">
      <Sidebar role={role} onRoleChange={handleRole} />

      <div className="main-content">
        <div className="topbar">
          <span className="topbar-title">Sales Reps</span>
          <div className="topbar-actions">
            <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
              {active.length} active · {reps.length} total
            </span>
            <button className="btn btn-primary" onClick={openAdd}>+ Add Rep</button>
          </div>
        </div>

        <div className="page-body">
          {/* Metrics */}
          <div className="metrics-row" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: 22 }}>
            <div className="metric-card metric-total">
              <span className="metric-icon">◎</span>
              <div className="metric-value">{reps.length}</div>
              <div className="metric-label">Total Reps</div>
            </div>
            <div className="metric-card metric-resolved">
              <span className="metric-icon">●</span>
              <div className="metric-value">{active.length}</div>
              <div className="metric-label">Active in Rotation</div>
            </div>
            <div className="metric-card metric-followup">
              <span className="metric-icon">○</span>
              <div className="metric-value">{inactive.length}</div>
              <div className="metric-label">Inactive</div>
            </div>
          </div>

          {/* Rep grid — full width now that the form lives in a modal */}
          {loading ? (
            <div className="loading-row">Loading…</div>
          ) : reps.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">◎</div>
              <div className="empty-state-text">No reps yet. Click <strong>+ Add Rep</strong> to create one.</div>
            </div>
          ) : (
            <div className="rep-grid">
              {reps.map((r, i) => (
                <div
                  key={r.id}
                  className={`rep-card${r.isActive ? "" : " inactive"}`}
                  style={{ animationDelay: `${i * 0.05}s` }}
                >
                  <div className="rep-card-header">
                    <div
                      className={`rep-avatar${r.isActive ? "" : " inactive"}`}
                      style={{ width: 38, height: 38, fontSize: 13 }}
                    >
                      {initials(r.name)}
                    </div>
                    <div className="rep-card-info">
                      <div className="rep-card-name">{r.name}</div>
                      <div className="rep-card-email">{r.email}</div>
                    </div>
                  </div>

                  <div className="rep-card-meta">
                    <span className={`badge ${r.isActive ? "badge-resolved" : "badge-escalated"}`}>
                      {r.isActive ? "Active" : "Inactive"}
                    </span>
                    <span style={{ marginLeft: "auto" }}>{timeAgo(r.createdAt)}</span>
                  </div>

                  <div className="rep-card-actions">
                    <button className="btn btn-ghost" style={{ flex: 1, justifyContent: "center", fontSize: 11 }} onClick={() => void toggle(r)}>
                      {r.isActive ? "Deactivate" : "Activate"}
                    </button>
                    <button className="btn btn-danger" style={{ fontSize: 11 }} onClick={() => void remove(r.id)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AddRepModal
        open={showAdd}
        onClose={closeAdd}
        name={name} email={email}
        error={error} saving={saving}
        onName={setName} onEmail={setEmail}
        onSave={addRep}
      />
    </div>
  );
}
