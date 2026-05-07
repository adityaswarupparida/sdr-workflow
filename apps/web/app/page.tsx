"use client";

import { useEffect, useState, useCallback } from "react";

type ConversationStatus = "active" | "pending_review" | "resolved" | "escalated";

interface SalesRep { id: string; name: string; email: string; }

interface Conversation {
  id: string;
  threadId: string;
  leadEmail: string;
  leadName?: string;
  status: ConversationStatus;
  escalationReason?: string;
  assignedRep?: SalesRep;
  createdAt: string;
  updatedAt: string;
  messages: unknown[];
}

const TABS: { label: string; value: string }[] = [
  { label: "All", value: "" },
  { label: "Needs Review", value: "pending_review" },
  { label: "Active", value: "active" },
  { label: "Resolved", value: "resolved" },
];

function Badge({ status }: { status: ConversationStatus }) {
  const label = status === "pending_review" ? "Needs Review" : status;
  return <span className={`badge badge-${status}`}>{label}</span>;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function HomePage() {
  const [tab, setTab] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const url = tab ? `/api/conversations?status=${tab}` : "/api/conversations";
    const res = await fetch(url);
    const data = (await res.json()) as Conversation[] | { error: string };
    setConversations(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [tab]);

  useEffect(() => { void load(); }, [load]);

  const allConvs = conversations;
  const needsReviewCount = allConvs.filter((c) => c.status === "pending_review").length;

  return (
    <>
      <h1 className="page-title">Conversations</h1>
      <p className="page-subtitle">AI-handled inbound emails · human review queue · full audit trail</p>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.value} className={`tab${tab === t.value ? " active" : ""}`} onClick={() => setTab(t.value)}>
            {t.label}
            {t.value === "pending_review" && needsReviewCount > 0 ? ` (${needsReviewCount})` : ""}
          </button>
        ))}
        <button className="tab" style={{ marginLeft: "auto" }} onClick={() => void load()}>↻ Refresh</button>
      </div>

      {loading ? (
        <p className="empty">Loading…</p>
      ) : conversations.length === 0 ? (
        <p className="empty">No conversations{tab ? ` with status "${tab}"` : ""}. Trigger one via <code>POST /webhooks/email</code> on the agent server.</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Lead</th>
                <th>Status</th>
                <th>Assigned Rep</th>
                <th>Escalation Reason</th>
                <th>Messages</th>
                <th>Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((c) => (
                <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => { window.location.href = `/conversations/${c.id}`; }}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{c.leadName ?? c.leadEmail}</div>
                    {c.leadName && <div className="ts">{c.leadEmail}</div>}
                  </td>
                  <td><Badge status={c.status} /></td>
                  <td className="ts">{c.assignedRep?.name ?? <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                  <td className="ts">{c.escalationReason?.replace(/_/g, " ") ?? "—"}</td>
                  <td className="ts">{c.messages.length}</td>
                  <td className="ts">{timeAgo(c.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
