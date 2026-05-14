"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";

type ConversationStatus = "active" | "pending_review" | "resolved" | "escalated" | "follow_up_pending";

interface SalesRep { id: string; name: string; email: string; isActive: boolean; }

interface ConversationMessage {
  role: "user" | "assistant" | "tool_use" | "tool_result";
  content: string;
  toolName?: string;
  toolInput?: unknown;
  toolResult?: unknown;
  timestamp: string;
}

interface Conversation {
  id: string;
  threadId: string;
  leadEmail: string;
  leadName?: string;
  status: ConversationStatus;
  escalationReason?: string;
  draftReply?: string;
  assignedRep?: SalesRep;
  createdAt: string;
  updatedAt: string;
  messages: ConversationMessage[];
}

function Badge({ status }: { status: ConversationStatus }) {
  const label = status === "pending_review" ? "Needs Review" : status;
  return <span className={`badge badge-${status}`}>{label}</span>;
}

function MessageBubble({ msg }: { msg: ConversationMessage }) {
  if (msg.role === "tool_use") {
    return (
      <div className="msg msg-tool_use">
        <div className="msg-label">Tool call → {msg.toolName}</div>
        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{JSON.stringify(msg.toolInput, null, 2)}</pre>
      </div>
    );
  }
  if (msg.role === "tool_result") {
    return (
      <div className="msg msg-tool_result">
        <div className="msg-label">Tool result ← {msg.toolName}</div>
        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{JSON.stringify(msg.toolResult, null, 2)}</pre>
      </div>
    );
  }
  return (
    <div className={`msg msg-${msg.role}`}>
      <div className="msg-label">{msg.role === "user" ? "Prospect" : "Agent"}</div>
      {msg.content}
    </div>
  );
}

export default function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [reps, setReps] = useState<SalesRep[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [customReply, setCustomReply] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  async function load() {
    setLoading(true);
    const [convRes, repsRes] = await Promise.all([
      fetch(`/api/conversations/${id}`),
      fetch("/api/reps"),
    ]);
    const convData = (await convRes.json()) as Conversation | { error: string };
    const repsData = (await repsRes.json()) as SalesRep[];
    setConversation("id" in convData ? convData : null);
    setReps(Array.isArray(repsData) ? repsData : []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [id]);

  async function approveDraft() {
    setActionLoading(true);
    await fetch(`/api/conversations/${id}?action=approve`, { method: "POST" });
    await load();
    setActionLoading(false);
  }

  async function sendCustomReply() {
    if (!customReply.trim()) return;
    setActionLoading(true);
    await fetch(`/api/conversations/${id}?action=reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: customReply }),
    });
    setCustomReply("");
    setShowCustom(false);
    await load();
    setActionLoading(false);
  }

  async function reassign(repId: string) {
    setActionLoading(true);
    await fetch(`/api/conversations/${id}?action=reassign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repId }),
    });
    await load();
    setActionLoading(false);
  }

  if (loading) return <p className="empty">Loading…</p>;
  if (!conversation) return <p className="empty">Conversation not found.</p>;

  return (
    <>
      <Link href="/" className="back-link">← Back to conversations</Link>

      <div className="detail-header">
        <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {conversation.leadName ?? conversation.leadEmail}
          <Badge status={conversation.status} />
        </h1>
        <p className="detail-lead">
          {conversation.leadEmail} · Thread: {conversation.threadId} · Started {new Date(conversation.createdAt).toLocaleString()}
        </p>
        {conversation.escalationReason && (
          <p className="detail-lead" style={{ marginTop: 4 }}>
            Escalation reason: <strong>{conversation.escalationReason.replace(/_/g, " ")}</strong>
          </p>
        )}

        {/* Assigned rep */}
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Assigned rep:</span>
          {conversation.assignedRep ? (
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              {conversation.assignedRep.name}
              <span style={{ fontWeight: 400, color: "var(--text-muted)" }}> &lt;{conversation.assignedRep.email}&gt;</span>
            </span>
          ) : (
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Unassigned</span>
          )}
          <select
            style={{ fontSize: 13, padding: "2px 8px", borderRadius: 4, border: "1px solid var(--border)" }}
            defaultValue=""
            onChange={(e) => { if (e.target.value) void reassign(e.target.value); }}
            disabled={actionLoading}
          >
            <option value="">Reassign…</option>
            {reps.filter((r) => r.isActive).map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      </div>

      {conversation.status === "pending_review" && conversation.draftReply && (
        <div className="review-panel">
          <div className="review-title">Human Review Required</div>
          <div className="review-reason">
            The agent escalated this conversation ({conversation.escalationReason?.replace(/_/g, " ")}).
            {conversation.assignedRep && ` Assigned to ${conversation.assignedRep.name} — they will be CC'd on the reply.`}
          </div>
          <div className="section-title">Draft reply</div>
          <div className="draft-body">{conversation.draftReply}</div>
          <div className="review-actions">
            <button className="btn btn-primary" onClick={() => void approveDraft()} disabled={actionLoading}>
              {actionLoading ? "Sending…" : "Approve & Send"}
            </button>
            <button className="btn btn-secondary" onClick={() => { setShowCustom(true); setCustomReply(conversation.draftReply ?? ""); }}>
              Edit & Send
            </button>
            <button className="btn btn-danger" onClick={() => setShowCustom(true)}>
              Discard — Write my own
            </button>
          </div>
        </div>
      )}

      {showCustom && (
        <div style={{ marginBottom: 24 }}>
          <div className="section-title">Your reply{conversation.assignedRep ? ` (${conversation.assignedRep.name} will be CC'd)` : ""}</div>
          <textarea
            style={{ width: "100%", minHeight: 120, padding: 12, borderRadius: 6, border: "1px solid var(--border)", fontFamily: "inherit", fontSize: 14, lineHeight: 1.5, marginBottom: 10 }}
            value={customReply}
            onChange={(e) => setCustomReply(e.target.value)}
            placeholder="Write your reply here…"
          />
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary" onClick={() => void sendCustomReply()} disabled={actionLoading}>
              {actionLoading ? "Sending…" : "Send"}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowCustom(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="section-title">Message timeline</div>
      <div className="messages">
        {conversation.messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}
      </div>
    </>
  );
}
