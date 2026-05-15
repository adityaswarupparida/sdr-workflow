"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "../hooks/use-session";
import { Sidebar, initials } from "../components/sidebar";

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

function Badge({ status }: { status: ConversationStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABELS[status]}</span>;
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
            <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
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
                    <td className="td-meta" style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
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
        <div className="empty-state-text">Your account isn&apos;t linked to a sales rep yet. Ask your admin to set it up.</div>
      </div>
    );
  }

  const mine = conversations
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
          <div className="empty-state-text">No open cases for you right now.</div>
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
  const { user, loading: sessionLoading } = useSession();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [reps, setReps] = useState<SalesRep[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [cr, rr] = await Promise.all([
      fetch("/api/conversations"),
      // reps only relevant for manager/admin view
      user.role === "rep" ? Promise.resolve({ json: async () => [] as SalesRep[] }) : fetch("/api/reps"),
    ]);
    const cd = (await cr.json()) as Conversation[] | { error: string };
    const rd = (await rr.json()) as SalesRep[];
    setConversations(Array.isArray(cd) ? cd : []);
    setReps(Array.isArray(rd) ? rd : []);
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  if (sessionLoading || !user) return <div className="login-shell"><div className="loading-row">Loading…</div></div>;

  const pendingCount = conversations.filter(c => c.status === "pending_review").length;
  const myRep = user.repId ? (reps.find(r => r.id === user.repId)
                          ?? (conversations.find(c => c.assignedRep?.id === user.repId)?.assignedRep)) : undefined;

  function open(id: string) { router.push(`/conversations/${id}`); }

  return (
    <div className="shell">
      <Sidebar user={user} pendingCount={pendingCount} page="conversations" />
      <div className="main-content">
        <div className="topbar">
          <span className="topbar-title">
            {user.role === "rep" ? (myRep?.name ?? user.username) : "Conversations"}
          </span>
          <div className="topbar-actions">
            <button className="btn-icon" onClick={() => void load()} aria-label="Refresh">↻</button>
          </div>
        </div>
        <div className="page-body">
          {loading ? (
            <div className="loading-row">Loading…</div>
          ) : user.role === "rep" ? (
            <RepView conversations={conversations} rep={myRep} onOpen={open} />
          ) : (
            <ManagerView conversations={conversations} reps={reps} onOpen={open} />
          )}
        </div>
      </div>
    </div>
  );
}
