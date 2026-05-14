"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type Role = "manager" | "rep";
type ConversationStatus = "active" | "pending_review" | "resolved" | "escalated" | "follow_up_pending";

interface SalesRep { id: string; name: string; email: string; isActive: boolean; }
interface Conversation {
  id: string; threadId: string; leadEmail: string; leadName?: string;
  status: ConversationStatus; escalationReason?: string;
  assignedRep?: SalesRep; messages: unknown[];
  createdAt: string; updatedAt: string;
}

const STATUS_LABELS: Record<ConversationStatus, string> = {
  active: "Active", pending_review: "Needs Review", resolved: "Resolved",
  escalated: "Escalated", follow_up_pending: "Follow-up",
};

const STATUS_ROW_ACCENT: Record<ConversationStatus, string> = {
  active: "#60a5fa", pending_review: "#fbbf24", resolved: "#34d399",
  escalated: "#f87171", follow_up_pending: "#c084fc",
};

const PRIORITY_ORDER: ConversationStatus[] = ["pending_review", "escalated", "follow_up_pending", "active", "resolved"];

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function initials(name: string) {
  return name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);
}

function Badge({ status }: { status: ConversationStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABELS[status]}</span>;
}

// ── Shared Sidebar ─────────────────────────────────────────────────────────────
function Sidebar({ role, onRoleChange, reps, selectedRepId, onRepChange, pendingCount, page }: {
  role: Role; onRoleChange: (r: Role) => void;
  reps: SalesRep[]; selectedRepId: string; onRepChange: (id: string) => void;
  pendingCount: number; page: "conversations" | "reps";
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">SDR</div>
        <div className="sidebar-logo-text">Agent</div>
      </div>

      <nav className="sidebar-nav">
        <span className="sidebar-section-label">Workspace</span>
        <a href="/" className={`sidebar-link${page === "conversations" ? " active" : ""}`}>
          <span className="sidebar-link-icon">◈</span>
          Conversations
          {pendingCount > 0 && <span className="sidebar-link-badge">{pendingCount}</span>}
        </a>
        <a href="/reps" className={`sidebar-link${page === "reps" ? " active" : ""}`}>
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
        {role === "rep" && (
          <select className="rep-selector" value={selectedRepId} onChange={e => onRepChange(e.target.value)}>
            <option value="">Select rep…</option>
            {reps.filter(r => r.isActive).map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        )}
      </div>
    </aside>
  );
}

// ── Manager View ───────────────────────────────────────────────────────────────
function ManagerView({ conversations, reps, onOpen }: {
  conversations: Conversation[]; reps: SalesRep[]; onOpen: (id: string) => void;
}) {
  const [filterStatus, setFilterStatus] = useState("");
  const [filterRep, setFilterRep] = useState("");

  const filtered = conversations.filter(c => {
    if (filterStatus && c.status !== filterStatus) return false;
    if (filterRep && c.assignedRep?.id !== filterRep) return false;
    return true;
  });

  const pending  = conversations.filter(c => c.status === "pending_review").length;
  const followup = conversations.filter(c => c.status === "follow_up_pending").length;
  const today    = conversations.filter(c => {
    const d = new Date(c.updatedAt);
    return c.status === "resolved" && d.toDateString() === new Date().toDateString();
  }).length;

  const repLoad = reps.map(r => ({
    rep: r,
    count: conversations.filter(c => c.assignedRep?.id === r.id && c.status !== "resolved").length,
  })).filter(x => x.count > 0).sort((a, b) => b.count - a.count);
  const maxLoad = Math.max(...repLoad.map(x => x.count), 1);

  return (
    <>
      <div className="metrics-row">
        <div className="metric-card metric-total">
          <span className="metric-icon">◈</span>
          <div className="metric-value">{conversations.length}</div>
          <div className="metric-label">Total</div>
        </div>
        <div className={`metric-card metric-urgent${pending > 0 ? " metric-hot" : ""}`}>
          <span className="metric-icon">⚑</span>
          <div className="metric-value">{pending}</div>
          <div className="metric-label">Needs Review</div>
        </div>
        <div className="metric-card metric-followup">
          <span className="metric-icon">◷</span>
          <div className="metric-value">{followup}</div>
          <div className="metric-label">Follow-up Pending</div>
        </div>
        <div className="metric-card metric-resolved">
          <span className="metric-icon">✓</span>
          <div className="metric-value">{today}</div>
          <div className="metric-label">Resolved Today</div>
        </div>
      </div>

      <div className="content-split">
        <div>
          <div className="toolbar">
            <select className="filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="pending_review">Needs Review</option>
              <option value="follow_up_pending">Follow-up Pending</option>
              <option value="active">Active</option>
              <option value="resolved">Resolved</option>
              <option value="escalated">Escalated</option>
            </select>
            <select className="filter-select" value={filterRep} onChange={e => setFilterRep(e.target.value)}>
              <option value="">All Reps</option>
              {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <span className="toolbar-spacer" />
            <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-geist-mono)" }}>
              {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Status</th>
                  <th>Assigned Rep</th>
                  <th>Escalation</th>
                  <th>Msgs</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="loading-row">No results</td></tr>
                ) : filtered.map(c => (
                  <tr
                    key={c.id}
                    onClick={() => onOpen(c.id)}
                    style={{ "--row-accent": STATUS_ROW_ACCENT[c.status] } as React.CSSProperties}
                  >
                    <td>
                      <div className="td-lead-email">{c.leadName ?? c.leadEmail}</div>
                      {c.leadName && <div className="td-lead-thread">{c.leadEmail}</div>}
                    </td>
                    <td><Badge status={c.status} /></td>
                    <td>
                      {c.assignedRep ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <div className="rep-avatar" style={{ width: 22, height: 22, fontSize: 8 }}>{initials(c.assignedRep.name)}</div>
                          <span className="td-meta">{c.assignedRep.name}</span>
                        </div>
                      ) : <span className="td-meta" style={{ color: "var(--text-3)" }}>—</span>}
                    </td>
                    <td className="td-meta" style={{ fontFamily: "var(--font-geist-mono)", fontSize: 11 }}>
                      {c.escalationReason ? c.escalationReason.replace(/_/g, " ") : "—"}
                    </td>
                    <td className="td-meta">{(c.messages as unknown[]).length}</td>
                    <td className="td-time">{timeAgo(c.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Workload panel */}
        <div className="workload-panel">
          <div className="workload-title">Rep Workload</div>
          {repLoad.length === 0 ? (
            <div style={{ fontSize: 11, color: "var(--text-3)", textAlign: "center", padding: "14px 0" }}>All clear</div>
          ) : repLoad.map(({ rep, count }) => (
            <div key={rep.id} className="workload-rep">
              <div className="rep-avatar" style={{ width: 24, height: 24, fontSize: 8 }}>{initials(rep.name)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="rep-name">{rep.name.split(" ")[0]}</div>
                <div className="rep-count">{count} open</div>
                <div className="rep-bar-wrap">
                  <div className="rep-bar" style={{ width: `${(count / maxLoad) * 100}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Rep View ───────────────────────────────────────────────────────────────────
function RepView({ conversations, rep, onOpen }: {
  conversations: Conversation[]; rep: SalesRep | undefined; onOpen: (id: string) => void;
}) {
  if (!rep) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">◎</div>
        <div className="empty-state-text">Select a rep from the sidebar to view their pipeline.</div>
      </div>
    );
  }

  const mine = conversations
    .filter(c => c.assignedRep?.id === rep.id)
    .sort((a, b) => PRIORITY_ORDER.indexOf(a.status) - PRIORITY_ORDER.indexOf(b.status));

  const grouped = PRIORITY_ORDER.reduce<Record<string, Conversation[]>>((acc, s) => {
    acc[s] = mine.filter(c => c.status === s);
    return acc;
  }, {});

  const SECTION_TITLES: Record<string, string> = {
    pending_review: "Needs Review",
    escalated: "Escalated",
    follow_up_pending: "Follow-up Scheduled",
    active: "Active",
    resolved: "Resolved",
  };

  function preview(c: Conversation) {
    const msgs = c.messages as Array<{ role: string; content: string }>;
    const last = [...msgs].reverse().find(m => m.role === "user" || m.role === "assistant");
    if (!last) return "No messages yet";
    const t = last.content.replace(/\[SYSTEM:.*?\]/g, "").trim();
    return t.length > 96 ? t.slice(0, 96) + "…" : t;
  }

  return (
    <>
      <div className="cards-header">
        <div className="rep-avatar">{initials(rep.name)}</div>
        <div className="cards-header-title">{rep.name}</div>
        <div className="cards-header-count">{mine.length} case{mine.length !== 1 ? "s" : ""}</div>
      </div>

      {mine.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">✓</div>
          <div className="empty-state-text">No open cases for {rep.name}.</div>
        </div>
      ) : PRIORITY_ORDER.filter(s => grouped[s]?.length).map(status => (
        <div key={status} className="priority-section">
          <div className="priority-label">{SECTION_TITLES[status]}</div>
          <div className="conv-cards">
            {grouped[status]!.map((c, i) => (
              <div
                key={c.id}
                className={`conv-card${status === "pending_review" || status === "escalated" ? " urgent" : ""}`}
                style={{ animationDelay: `${i * 0.04}s` }}
                onClick={() => onOpen(c.id)}
              >
                <div className="conv-card-top">
                  <div className="conv-card-email">{c.leadName ?? c.leadEmail}</div>
                  <Badge status={c.status} />
                </div>
                <div className="conv-card-preview">{preview(c)}</div>
                <div className="conv-card-footer">
                  <div className="conv-card-rep">
                    <div className="rep-avatar" style={{ width: 14, height: 14, fontSize: 7 }}>{initials(rep.name)}</div>
                    {rep.name.split(" ")[0]}
                  </div>
                  <div className="conv-card-time">{timeAgo(c.updatedAt)} ago</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("manager");
  const [selectedRepId, setSelectedRepId] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [reps, setReps] = useState<SalesRep[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const r = localStorage.getItem("sdr-role") as Role | null;
    const rid = localStorage.getItem("sdr-rep-id") ?? "";
    if (r) setRole(r);
    setSelectedRepId(rid);
  }, []);

  const handleRole = (r: Role) => { setRole(r); localStorage.setItem("sdr-role", r); };
  const handleRep  = (id: string) => { setSelectedRepId(id); localStorage.setItem("sdr-rep-id", id); };

  const load = useCallback(async () => {
    setLoading(true);
    const [cr, rr] = await Promise.all([fetch("/api/conversations"), fetch("/api/reps")]);
    const cd = await cr.json() as Conversation[] | { error: string };
    const rd = await rr.json() as SalesRep[];
    setConversations(Array.isArray(cd) ? cd : []);
    setReps(Array.isArray(rd) ? rd : []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const pendingCount = conversations.filter(c => c.status === "pending_review").length;
  const selectedRep  = reps.find(r => r.id === selectedRepId);

  function open(id: string) {
    router.push(`/conversations/${id}?role=${role}${selectedRepId ? `&repId=${selectedRepId}` : ""}`);
  }

  return (
    <div className="shell">
      <Sidebar
        role={role} onRoleChange={handleRole}
        reps={reps} selectedRepId={selectedRepId} onRepChange={handleRep}
        pendingCount={pendingCount} page="conversations"
      />
      <div className="main-content">
        <div className="topbar">
          <span className="topbar-title">
            {role === "manager" ? "Conversations" : `${selectedRep?.name ?? "Select a rep"}`}
          </span>
          <div className="topbar-actions">
            <button className="btn-icon" onClick={() => void load()}>↻</button>
          </div>
        </div>
        <div className="page-body">
          {loading ? (
            <div className="loading-row">Loading…</div>
          ) : role === "manager" ? (
            <ManagerView conversations={conversations} reps={reps} onOpen={open} />
          ) : (
            <RepView conversations={conversations} rep={selectedRep} onOpen={open} />
          )}
        </div>
      </div>
    </div>
  );
}
