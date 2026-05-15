"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Suspense } from "react";
import { BrandLogo } from "../../../components/brand-logo";
import { Sidebar, initials } from "../../../components/sidebar";
import { useSession } from "../../../hooks/use-session";

type ConversationStatus = "active" | "pending_review" | "resolved" | "escalated" | "follow_up_pending";

interface SalesRep { id: string; name: string; email: string; isActive: boolean; }
interface ConversationMessage {
  role: "user" | "assistant" | "tool_use" | "tool_result";
  content: string; toolName?: string; toolInput?: unknown; toolResult?: unknown; timestamp: string;
}
interface Conversation {
  id: string; threadId: string; leadEmail: string; leadName?: string;
  status: ConversationStatus; escalationReason?: string; draftReply?: string;
  assignedRep?: SalesRep; messages: ConversationMessage[];
  createdAt: string; updatedAt: string;
}

const STATUS_LABELS: Record<ConversationStatus, string> = {
  active: "Active", pending_review: "Needs Review", resolved: "Resolved",
  escalated: "Escalated", follow_up_pending: "Follow-up Pending",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Badge({ status }: { status: ConversationStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABELS[status]}</span>;
}

// ── Tool cards ─────────────────────────────────────────────────────────────────

type ToolEntry = { input: ConversationMessage; result: ConversationMessage | null };

type ToolConfig = {
  label: string;
  cls: string;
  brand?: string;             // logo.dev name slug (undefined → glyph)
  glyph?: "clock";            // built-in SVG fallback for tools without a brand
};

const TOOL_CONFIG: Record<string, ToolConfig> = {
  salesforce_get_contact:       { label: "Salesforce Lookup",         cls: "tc-sf",       brand: "salesforce.co" },
  salesforce_get_opportunities: { label: "Salesforce Opportunities",  cls: "tc-sf",       brand: "salesforce.co" },
  hubspot_upsert_contact:       { label: "HubSpot · Sync Contact",    cls: "tc-hs",       brand: "hubspot.com" },
  hubspot_log_activity:         { label: "HubSpot · Log Activity",    cls: "tc-hs",       brand: "hubspot.com" },
  hubspot_update_deal_stage:    { label: "HubSpot · Update Deal",     cls: "tc-hs",       brand: "hubspot.com" },
  send_email:                   { label: "Email Sent",                cls: "tc-email",    brand: "google.com" },
  schedule_followup:            { label: "Follow-up Scheduled",       cls: "tc-followup", glyph: "clock" },
  escalate_to_human:            { label: "Escalated to Human",        cls: "tc-escalate", brand: "slack.com" },
};

function formatTime(ts: string | undefined): string {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function summarize(
  toolName: string | undefined,
  inp: Record<string, unknown> | undefined,
  out: Record<string, unknown> | null | undefined,
): string {
  switch (toolName) {
    case "salesforce_get_contact": {
      if (!out || "error" in out) return "Contact not found";
      const lead = out as { name?: string; company?: string };
      return [lead.name, lead.company].filter(Boolean).join(" · ") || "Found";
    }
    case "salesforce_get_opportunities": {
      const opps = Array.isArray(out) ? out : [];
      if (!opps.length) return "No open opportunities";
      return `${opps.length} open opportunit${opps.length === 1 ? "y" : "ies"}`;
    }
    case "hubspot_upsert_contact": {
      const email = inp?.["email"] as string | undefined;
      return email ? `${email} · synced` : "Contact synced";
    }
    case "hubspot_log_activity": {
      const subject = inp?.["subject"] as string | undefined;
      return subject ? `“${subject}”` : "Activity logged";
    }
    case "hubspot_update_deal_stage": {
      const stage = inp?.["stage"] as string | undefined;
      return stage ? `Stage → ${stage.replace(/_/g, " ")}` : "Deal updated";
    }
    case "send_email": {
      const to = inp?.["to"] as string | undefined;
      const subject = inp?.["subject"] as string | undefined;
      return [subject ? `“${subject}”` : null, to ? `→ ${to}` : null].filter(Boolean).join(" ") || "Email sent";
    }
    case "schedule_followup": {
      const days = inp?.["daysFromNow"] as number | undefined;
      const reason = inp?.["reason"] as string | undefined;
      const lead = days != null ? `In ${days} day${days === 1 ? "" : "s"}` : null;
      return [lead, reason].filter(Boolean).join(" — ") || "Follow-up scheduled";
    }
    case "escalate_to_human": {
      const reason = (inp?.["reason"] as string | undefined)?.replace(/_/g, " ");
      const urgency = inp?.["urgency"] as string | undefined;
      return [reason, urgency ? `· ${urgency}` : null].filter(Boolean).join(" ") || "Escalated";
    }
    default:
      return "";
  }
}

function ClockGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9.5" />
      <polyline points="12,6.5 12,12 16,14" />
    </svg>
  );
}

function ToolIcon({ cfg }: { cfg: ToolConfig }) {
  if (cfg.brand) return <BrandLogo name={cfg.brand} size={26} alt={cfg.label} />;
  if (cfg.glyph === "clock") return <ClockGlyph />;
  return <span style={{ fontSize: 18, color: "currentColor" }}>◆</span>;
}

function ToolCard({ entry }: { entry: ToolEntry }) {
  const [expanded, setExpanded] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const { toolName } = entry.input;
  const inp = entry.input.toolInput as Record<string, unknown> | undefined;
  const out = entry.result?.toolResult as Record<string, unknown> | null | undefined;

  const cfg: ToolConfig = TOOL_CONFIG[toolName ?? ""] ?? { label: toolName ?? "Tool", cls: "tc-generic" };
  const summary = summarize(toolName, inp, out);
  const time = formatTime(entry.input.timestamp);

  function renderBody() {
    switch (toolName) {
      case "salesforce_get_contact": {
        if (!out || "error" in out) {
          return <div className="tool-hero-sub" style={{ marginTop: 14 }}>Contact not found in Salesforce.</div>;
        }
        const lead = out as { name?: string; email?: string; company?: string; title?: string; status?: string; industry?: string; employeeCount?: number };
        return (
          <>
            {lead.name && <div className="tool-hero">{lead.name}</div>}
            {lead.company && <div className="tool-hero-sub">{lead.company}{lead.title ? ` · ${lead.title}` : ""}</div>}
            <div className="tool-stats">
              {lead.status && (
                <div>
                  <div className="tool-stat-key">Status</div>
                  <div className="tool-stat-val"><span className={`badge badge-${lead.status}`}>{lead.status}</span></div>
                </div>
              )}
              {lead.industry && (
                <div>
                  <div className="tool-stat-key">Industry</div>
                  <div className="tool-stat-val">{lead.industry}</div>
                </div>
              )}
              {lead.employeeCount != null && (
                <div>
                  <div className="tool-stat-key">Employees</div>
                  <div className="tool-stat-val mono">{lead.employeeCount.toLocaleString()}</div>
                </div>
              )}
              {lead.email && (
                <div>
                  <div className="tool-stat-key">Email</div>
                  <div className="tool-stat-val mono">{lead.email}</div>
                </div>
              )}
            </div>
          </>
        );
      }
      case "salesforce_get_opportunities": {
        const opps = Array.isArray(out) ? out as Array<{ name?: string; stage?: string; amount?: number; closeDate?: string }> : [];
        if (!opps.length) return <div className="tool-hero-sub" style={{ marginTop: 14 }}>No open opportunities.</div>;
        return (
          <div style={{ marginTop: 14 }}>
            {opps.map((o, i) => (
              <div key={i} className="opp-row">
                {o.name && <div className="opp-row-title">{o.name}</div>}
                <div className="tool-stats">
                  {o.stage && (
                    <div>
                      <div className="tool-stat-key">Stage</div>
                      <div className="tool-stat-val">{o.stage.replace(/_/g, " ")}</div>
                    </div>
                  )}
                  {o.amount != null && (
                    <div>
                      <div className="tool-stat-key">Amount</div>
                      <div className="tool-stat-val mono">${o.amount.toLocaleString()}</div>
                    </div>
                  )}
                  {o.closeDate && (
                    <div>
                      <div className="tool-stat-key">Close date</div>
                      <div className="tool-stat-val mono">{o.closeDate}</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      }
      case "hubspot_upsert_contact": {
        const contactId = (out as { contactId?: string } | null)?.contactId;
        const email = inp?.["email"] as string | undefined;
        const name = inp?.["name"] as string | undefined;
        const company = inp?.["company"] as string | undefined;
        const title = inp?.["title"] as string | undefined;
        return (
          <>
            <div className="tool-hero-row">
              <div className="tool-hero">{name || email || "Contact"}</div>
              <div className="tool-result">Synced to HubSpot</div>
            </div>
            {company && <div className="tool-hero-sub">{company}{title ? ` · ${title}` : ""}</div>}
            <div className="tool-stats">
              {email && (
                <div>
                  <div className="tool-stat-key">Email</div>
                  <div className="tool-stat-val mono">{email}</div>
                </div>
              )}
              {contactId && (
                <div>
                  <div className="tool-stat-key">Contact ID</div>
                  <div className="tool-stat-val mono">{contactId}</div>
                </div>
              )}
            </div>
          </>
        );
      }
      case "hubspot_log_activity": {
        const subject = inp?.["subject"] as string | undefined;
        const contactId = inp?.["contactId"] as string | undefined;
        return (
          <>
            <div className="tool-hero-row">
              <div className="tool-hero">{subject ?? "Activity"}</div>
              <div className="tool-result">Activity logged</div>
            </div>
            <div className="tool-stats">
              <div>
                <div className="tool-stat-key">Contact ID</div>
                <div className="tool-stat-val mono">{contactId ?? "—"}</div>
              </div>
            </div>
          </>
        );
      }
      case "hubspot_update_deal_stage": {
        const stage = inp?.["stage"] as string | undefined;
        const contactId = inp?.["contactId"] as string | undefined;
        return (
          <>
            <div className="tool-hero-row">
              <div className="tool-hero">Stage → {stage?.replace(/_/g, " ") ?? "—"}</div>
              <div className="tool-result">Deal updated</div>
            </div>
            <div className="tool-stats">
              <div>
                <div className="tool-stat-key">Contact ID</div>
                <div className="tool-stat-val mono">{contactId ?? "—"}</div>
              </div>
            </div>
          </>
        );
      }
      case "send_email": {
        const body = (inp?.["body"] as string | undefined) ?? "";
        const subject = inp?.["subject"] as string | undefined;
        const to = inp?.["to"] as string | undefined;
        return (
          <>
            {subject && <div className="tool-hero">{subject}</div>}
            <div className="tool-stats">
              {to && (
                <div>
                  <div className="tool-stat-key">To</div>
                  <div className="tool-stat-val mono">{to}</div>
                </div>
              )}
              {entry.input.timestamp && (
                <div>
                  <div className="tool-stat-key">Sent at</div>
                  <div className="tool-stat-val mono">{new Date(entry.input.timestamp).toLocaleString()}</div>
                </div>
              )}
            </div>
            {body && <div className="tool-email-body">{body}</div>}
          </>
        );
      }
      case "schedule_followup": {
        const days = inp?.["daysFromNow"] as number | undefined;
        const reason = inp?.["reason"] as string | undefined;
        const leadId = inp?.["leadId"] as string | undefined;
        const fires = (out as { scheduledFor?: string } | null)?.scheduledFor;
        return (
          <>
            <div className="tool-hero">In {days ?? "—"} day{days === 1 ? "" : "s"}</div>
            {reason && <div className="tool-hero-sub">{reason}</div>}
            <div className="tool-stats">
              {fires && (
                <div>
                  <div className="tool-stat-key">Fires on</div>
                  <div className="tool-stat-val mono">{new Date(fires).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</div>
                </div>
              )}
              {leadId && (
                <div>
                  <div className="tool-stat-key">Lead ID</div>
                  <div className="tool-stat-val mono">{leadId}</div>
                </div>
              )}
            </div>
          </>
        );
      }
      case "escalate_to_human": {
        const reason = inp?.["reason"] as string | undefined;
        const urgency = inp?.["urgency"] as string | undefined;
        const draft = inp?.["draftReply"] as string | undefined;
        return (
          <>
            <div className="tool-hero" style={{ color: "var(--danger)" }}>
              {reason?.replace(/_/g, " ") ?? "Escalated"}
            </div>
            <div className="tool-stats">
              {urgency && (
                <div>
                  <div className="tool-stat-key">Urgency</div>
                  <div className={`tool-stat-val ${urgency === "high" ? "danger" : "warning"}`}>{urgency}</div>
                </div>
              )}
            </div>
            {draft && (
              <>
                <div className="tool-stat-key" style={{ marginTop: 16, marginBottom: 8 }}>Draft reply</div>
                <div className="tool-email-body">{draft}</div>
              </>
            )}
          </>
        );
      }
      default:
        return <div className="tool-hero-sub" style={{ marginTop: 14 }}>Tool executed.</div>;
    }
  }

  const hasRaw = Boolean(inp || out);

  return (
    <div className={`tool-card ${cfg.cls}`}>
      <div className="tool-card-header" onClick={() => setExpanded(!expanded)}>
        <div className="tool-card-icon"><ToolIcon cfg={cfg} /></div>
        <div className="tool-card-meta">
          <div className="tool-card-label">{cfg.label}</div>
          {summary && <div className="tool-card-summary">{summary}</div>}
        </div>
        <div className="tool-card-time">{time}</div>
        <span className={`tool-card-toggle${expanded ? " open" : ""}`}>▼</span>
      </div>
      {expanded && (
        <div className="tool-card-body">
          {renderBody()}
          {hasRaw && (
            <>
              <div className="tool-divider" />
              <button className="tool-raw-toggle" onClick={() => setRawOpen(!rawOpen)}>
                {rawOpen ? "▲" : "▶"} Raw data
              </button>
              {rawOpen && (
                <pre className="tool-raw">{JSON.stringify({ input: inp, output: out }, null, 2)}</pre>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Timeline grouping ──────────────────────────────────────────────────────────

type TimelineItem =
  | { kind: "prospect"; msg: ConversationMessage }
  | { kind: "agent"; msg: ConversationMessage }
  | { kind: "tool"; entry: ToolEntry };

function buildTimeline(messages: ConversationMessage[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  let i = 0;
  while (i < messages.length) {
    const msg = messages[i]!;
    if (msg.role === "user") {
      items.push({ kind: "prospect", msg });
      i++;
    } else if (msg.role === "assistant") {
      items.push({ kind: "agent", msg });
      i++;
    } else if (msg.role === "tool_use") {
      const next = messages[i + 1];
      const result = next?.role === "tool_result" ? next : null;
      items.push({ kind: "tool", entry: { input: msg, result } });
      i += result ? 2 : 1;
    } else {
      i++; // skip orphan tool_result
    }
  }
  return items;
}

// ── Detail inner ───────────────────────────────────────────────────────────────

function DetailInner({ id }: { id: string }) {
  const router = useRouter();
  const { user, loading: sessionLoading } = useSession();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [reps, setReps] = useState<SalesRep[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [customReply, setCustomReply] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  async function load() {
    if (!user) return;
    setLoading(true);
    const [convRes, repsRes] = await Promise.all([
      fetch(`/api/conversations/${id}`),
      user.role === "rep" ? Promise.resolve({ ok: true, json: async () => [] as SalesRep[] }) : fetch("/api/reps"),
    ]);
    const convData = await convRes.json() as Conversation | { error: string };
    const repsData = await repsRes.json() as SalesRep[];
    setConversation("id" in convData ? convData : null);
    setReps(Array.isArray(repsData) ? repsData : []);
    setLoading(false);
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id, user]);

  async function approveDraft() {
    setActionLoading(true);
    await fetch(`/api/conversations/${id}?action=approve`, { method: "POST" });
    await load(); setActionLoading(false);
  }

  async function sendCustomReply() {
    if (!customReply.trim()) return;
    setActionLoading(true);
    await fetch(`/api/conversations/${id}?action=reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: customReply }),
    });
    setCustomReply(""); setShowCustom(false);
    await load(); setActionLoading(false);
  }

  async function reassign(repId: string) {
    setActionLoading(true);
    await fetch(`/api/conversations/${id}?action=reassign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repId }),
    });
    await load(); setActionLoading(false);
  }

  function goBack() { router.push("/"); }

  if (sessionLoading || !user) return <div className="login-shell"><div className="loading-row">Loading…</div></div>;

  if (loading) return (
    <div className="shell">
      <Sidebar user={user} page="conversations" />
      <div className="main-content"><div className="loading-row">Loading…</div></div>
    </div>
  );

  if (!conversation) return (
    <div className="shell">
      <Sidebar user={user} page="conversations" />
      <div className="main-content"><div className="loading-row">Conversation not found.</div></div>
    </div>
  );

  const timeline = buildTimeline(conversation.messages);
  const canReassign = user.role === "admin" || user.role === "manager";

  return (
    <div className="shell">
      <Sidebar user={user} page="conversations" />

      <div className="main-content">
        <div className="topbar">
          <button className="back-btn" onClick={goBack}>← Conversations</button>
          <span className="topbar-title">{conversation.leadName ?? conversation.leadEmail}</span>
          <div className="topbar-actions">
            <Badge status={conversation.status} />
          </div>
        </div>

        <div className="page-body">
          <div className="detail-wrap">

            {/* Header */}
            <div className="detail-header">
              <div className="detail-header-top">
                <div>
                  <div className="detail-lead-name">{conversation.leadName ?? conversation.leadEmail}</div>
                  <div className="detail-meta" style={{ marginTop: 4 }}>
                    {conversation.leadEmail} · Thread {conversation.threadId.slice(0, 16)}… · Started {new Date(conversation.createdAt).toLocaleDateString()}
                  </div>
                  {conversation.escalationReason && (
                    <div style={{ marginTop: 6, fontSize: 12, color: "var(--s-escalated-text)", fontWeight: 600 }}>
                      ⚑ Escalated: {conversation.escalationReason.replace(/_/g, " ")}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "right", whiteSpace: "nowrap" }}>
                  {conversation.messages.length} messages<br />
                  <span style={{ fontFamily: "var(--font-geist-mono)" }}>Updated {timeAgo(conversation.updatedAt)}</span>
                </div>
              </div>

              <div className="detail-rep-row">
                <div className="detail-rep-label">Assigned</div>
                {conversation.assignedRep ? (
                  <>
                    <div className="rep-avatar">{initials(conversation.assignedRep.name)}</div>
                    <div>
                      <div className="detail-rep-name">{conversation.assignedRep.name}</div>
                      <div className="detail-rep-email">{conversation.assignedRep.email}</div>
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Unassigned</div>
                )}
                {canReassign && (
                  <select
                    className="reassign-select"
                    defaultValue=""
                    onChange={e => { if (e.target.value) void reassign(e.target.value); }}
                    disabled={actionLoading}
                  >
                    <option value="">Reassign…</option>
                    {reps.filter(r => r.isActive).map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Review panel */}
            {conversation.status === "pending_review" && conversation.draftReply && (
              <div className="review-panel">
                <div className="review-panel-header">
                  <span className="review-panel-icon">⚑</span>
                  <span className="review-panel-title">Human Review Required</span>
                </div>
                <div className="review-panel-reason">
                  Agent escalated — reason: {conversation.escalationReason?.replace(/_/g, " ") ?? "unknown"}.
                  {conversation.assignedRep && ` ${conversation.assignedRep.name} will be CC'd.`}
                </div>
                <div className="draft-label">Agent Draft</div>
                <div className="draft-body">{conversation.draftReply}</div>
                <div className="review-actions">
                  <button className="btn btn-primary" onClick={() => void approveDraft()} disabled={actionLoading}>
                    {actionLoading ? "Sending…" : "✓ Approve & Send"}
                  </button>
                  <button className="btn btn-secondary" onClick={() => { setShowCustom(true); setCustomReply(conversation.draftReply ?? ""); }}>
                    Edit & Send
                  </button>
                  <button className="btn btn-danger" onClick={() => setShowCustom(true)}>
                    Discard
                  </button>
                </div>
              </div>
            )}

            {/* Custom reply */}
            {showCustom && (
              <div className="reply-box">
                <div className="reply-box-label">
                  Your reply{conversation.assignedRep ? ` — ${conversation.assignedRep.name} will be CC'd` : ""}
                </div>
                <textarea
                  className="reply-textarea"
                  value={customReply}
                  onChange={e => setCustomReply(e.target.value)}
                  placeholder="Write your reply…"
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button className="btn btn-primary" onClick={() => void sendCustomReply()} disabled={actionLoading}>
                    {actionLoading ? "Sending…" : "Send"}
                  </button>
                  <button className="btn btn-secondary" onClick={() => setShowCustom(false)}>Cancel</button>
                </div>
              </div>
            )}

            {/* Timeline */}
            <div className="section-label">Agent Timeline</div>
            <div className="timeline">
              {timeline.length === 0 ? (
                <div className="empty-state"><div className="empty-state-text">No messages yet.</div></div>
              ) : timeline.map((item, i) => (
                <div key={i} className="timeline-msg">
                  {item.kind === "prospect" && (
                    <div className="msg-prospect">
                      <div className="msg-prospect-header">
                        <span className="msg-prospect-label">Prospect</span>
                        <span className="msg-prospect-time">{item.msg.timestamp ? new Date(item.msg.timestamp).toLocaleTimeString() : ""}</span>
                      </div>
                      <div className="msg-prospect-body">{item.msg.content}</div>
                    </div>
                  )}
                  {item.kind === "agent" && (
                    <div className="msg-agent">
                      <div className="msg-agent-header">
                        <span className="msg-agent-label">Agent · {conversation.assignedRep?.name ?? "SDR Agent"}</span>
                      </div>
                      <div className="msg-agent-body">{item.msg.content}</div>
                    </div>
                  )}
                  {item.kind === "tool" && (
                    <ToolCard entry={item.entry} />
                  )}
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page export ────────────────────────────────────────────────────────────────

export default function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<div className="loading-row">Loading…</div>}>
      <DetailInner id={id} />
    </Suspense>
  );
}
