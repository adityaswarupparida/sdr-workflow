"use client";

import { useEffect, useState, useCallback } from "react";

interface SalesRep {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: string;
}

export default function RepsPage() {
  const [reps, setReps] = useState<SalesRep[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/reps");
    const data = (await res.json()) as SalesRep[];
    setReps(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function addRep() {
    if (!newName.trim() || !newEmail.trim()) { setError("Name and email are required."); return; }
    setSaving(true);
    setError("");
    const res = await fetch("/api/reps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), email: newEmail.trim() }),
    });
    if (res.ok) { setNewName(""); setNewEmail(""); await load(); }
    else { setError("Failed to add rep."); }
    setSaving(false);
  }

  async function toggleActive(rep: SalesRep) {
    await fetch(`/api/reps/${rep.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !rep.isActive }),
    });
    await load();
  }

  async function removeRep(id: string) {
    await fetch(`/api/reps/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <>
      <h1 className="page-title">Sales Reps</h1>
      <p className="page-subtitle">Manage the round-robin assignment roster. Active reps are auto-assigned to inbound emails and CC'd on all replies.</p>

      {/* Add rep form */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 20, marginBottom: 28 }}>
        <div className="section-title" style={{ marginBottom: 14 }}>Add rep</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Full name</label>
            <input
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 14, width: 200 }}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Sarah Chen"
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Work email</label>
            <input
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 14, width: 240 }}
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="sarah@yourcompany.com"
              type="email"
            />
          </div>
          <button className="btn btn-primary" onClick={() => void addRep()} disabled={saving}>
            {saving ? "Adding…" : "Add Rep"}
          </button>
        </div>
        {error && <p style={{ fontSize: 13, color: "#991b1b", marginTop: 8 }}>{error}</p>}
      </div>

      {/* Rep roster */}
      {loading ? (
        <p className="empty">Loading…</p>
      ) : reps.length === 0 ? (
        <p className="empty">No reps yet. Add one above.</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Added</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reps.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td className="ts">{r.email}</td>
                  <td>
                    <span className={`badge ${r.isActive ? "badge-resolved" : "badge-escalated"}`}>
                      {r.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="ts">{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-secondary" style={{ padding: "4px 12px", fontSize: 13 }} onClick={() => void toggleActive(r)}>
                        {r.isActive ? "Deactivate" : "Activate"}
                      </button>
                      <button className="btn btn-danger" style={{ padding: "4px 12px", fontSize: 13 }} onClick={() => void removeRep(r.id)}>
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
