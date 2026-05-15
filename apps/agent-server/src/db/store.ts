import { Database } from "bun:sqlite";
import { CREATE_TABLES } from "./schema.js";
import type {
  Conversation,
  ConversationMessage,
  ConversationStatus,
  ConversationSummary,
  EscalationReason,
  SalesRep,
  SummaryAction,
  User,
  UserRole,
  UserWithHash,
} from "../types/index.js";

const db = new Database(process.env["DB_PATH"] ?? "sdr.db", { create: true });
db.run("PRAGMA journal_mode=WAL;");
db.exec(CREATE_TABLES);

// Migrate existing DBs that predate added columns
const MIGRATIONS = [
  "ALTER TABLE conversations ADD COLUMN assignedRepId TEXT REFERENCES sales_reps(id)",
  "ALTER TABLE conversations ADD COLUMN summary TEXT",
];
for (const sql of MIGRATIONS) {
  try { db.run(sql); } catch { /* column already exists */ }
}

function now(): string {
  return new Date().toISOString();
}

// ── Sales Reps ────────────────────────────────────────────────────────────────

function rowToRep(row: Record<string, unknown>): SalesRep {
  return {
    id: row["id"] as string,
    name: row["name"] as string,
    email: row["email"] as string,
    isActive: Boolean(row["isActive"]),
    createdAt: row["createdAt"] as string,
  };
}

export function listReps(activeOnly = false): SalesRep[] {
  const rows = activeOnly
    ? (db.prepare("SELECT * FROM sales_reps WHERE isActive = 1 ORDER BY createdAt ASC").all() as Record<string, unknown>[])
    : (db.prepare("SELECT * FROM sales_reps ORDER BY createdAt ASC").all() as Record<string, unknown>[]);
  return rows.map(rowToRep);
}

export function getRep(id: string): SalesRep | null {
  const row = db.prepare("SELECT * FROM sales_reps WHERE id = ?").get(id) as Record<string, unknown> | null;
  return row ? rowToRep(row) : null;
}

export function createRep(name: string, email: string): SalesRep {
  const id = `rep_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const ts = now();
  db.prepare("INSERT INTO sales_reps (id, name, email, isActive, createdAt) VALUES (?, ?, ?, 1, ?)").run(id, name, email, ts);
  return rowToRep(db.prepare("SELECT * FROM sales_reps WHERE id = ?").get(id) as Record<string, unknown>);
}

export function updateRep(id: string, fields: Partial<Pick<SalesRep, "name" | "email" | "isActive">>): SalesRep | null {
  const rep = getRep(id);
  if (!rep) return null;
  const name = fields.name ?? rep.name;
  const email = fields.email ?? rep.email;
  const isActive = fields.isActive !== undefined ? (fields.isActive ? 1 : 0) : (rep.isActive ? 1 : 0);
  db.prepare("UPDATE sales_reps SET name = ?, email = ?, isActive = ? WHERE id = ?").run(name, email, isActive, id);
  return getRep(id);
}

export function deleteRep(id: string): void {
  db.prepare("DELETE FROM sales_reps WHERE id = ?").run(id);
}

/** Round-robin: assign to the active rep with the fewest conversations */
export function assignRepRoundRobin(): SalesRep | null {
  const row = db.prepare(`
    SELECT r.*, COUNT(c.id) AS convCount
    FROM sales_reps r
    LEFT JOIN conversations c ON c.assignedRepId = r.id
    WHERE r.isActive = 1
    GROUP BY r.id
    ORDER BY convCount ASC, r.createdAt ASC
    LIMIT 1
  `).get() as (Record<string, unknown> & { convCount: number }) | null;

  return row ? rowToRep(row) : null;
}

// ── Conversations ─────────────────────────────────────────────────────────────

function rowToConversation(row: Record<string, unknown>): Conversation {
  const repId = row["assignedRepId"] as string | undefined;
  const rep = repId ? getRep(repId) ?? undefined : undefined;
  return {
    id: row["id"] as string,
    threadId: row["threadId"] as string,
    leadEmail: row["leadEmail"] as string,
    leadName: (row["leadName"] as string | null) ?? undefined,
    messages: JSON.parse(row["messages"] as string) as ConversationMessage[],
    status: row["status"] as ConversationStatus,
    escalationReason: ((row["escalationReason"] as string | null) ?? undefined) as EscalationReason | undefined,
    draftReply: (row["draftReply"] as string | null) ?? undefined,
    assignedRepId: repId,
    assignedRep: rep,
    summary: row["summary"] ? JSON.parse(row["summary"] as string) as ConversationSummary : undefined,
    createdAt: row["createdAt"] as string,
    updatedAt: row["updatedAt"] as string,
  };
}

export async function saveSummary(conversationId: string, summary: ConversationSummary): Promise<void> {
  db.prepare("UPDATE conversations SET summary = ?, updatedAt = ? WHERE id = ?").run(
    JSON.stringify(summary), now(), conversationId,
  );
}

export async function getOrCreateConversation(threadId: string, leadEmail: string): Promise<Conversation> {
  const existing = db.prepare("SELECT * FROM conversations WHERE threadId = ?").get(threadId) as Record<string, unknown> | null;
  if (existing) return rowToConversation(existing);

  const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const ts = now();
  const rep = assignRepRoundRobin();

  db.prepare(
    "INSERT INTO conversations (id, threadId, leadEmail, messages, status, assignedRepId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(id, threadId, leadEmail, "[]", "active", rep?.id ?? null, ts, ts);

  if (rep) {
    console.log(`[Assign] Conversation ${id} → ${rep.name} <${rep.email}>`);
  }

  return rowToConversation(db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as Record<string, unknown>);
}

export async function appendMessage(conversationId: string, message: ConversationMessage): Promise<void> {
  const row = db.prepare("SELECT messages FROM conversations WHERE id = ?").get(conversationId) as { messages: string } | null;
  if (!row) throw new Error(`Conversation ${conversationId} not found`);
  const messages = JSON.parse(row.messages) as ConversationMessage[];
  messages.push(message);
  db.prepare("UPDATE conversations SET messages = ?, updatedAt = ? WHERE id = ?").run(JSON.stringify(messages), now(), conversationId);
}

export async function markResolved(conversationId: string): Promise<void> {
  db.prepare("UPDATE conversations SET status = ?, updatedAt = ? WHERE id = ?").run("resolved", now(), conversationId);
}

export async function markFollowUpPending(conversationId: string): Promise<void> {
  db.prepare("UPDATE conversations SET status = ?, updatedAt = ? WHERE id = ?").run("follow_up_pending", now(), conversationId);
}

// Specialist reasons need a dedicated person (AE/SE/CS/Legal) → "escalated"
// low_confidence just needs any rep to review → "pending_review"
const SPECIALIST_REASONS: EscalationReason[] = [
  "pricing_or_quote", "technical_deep_dive", "existing_customer", "legal_or_contract",
];

export async function setEscalated(conversationId: string, reason: EscalationReason, draftReply?: string): Promise<void> {
  const status = SPECIALIST_REASONS.includes(reason) ? "escalated" : "pending_review";
  db.prepare("UPDATE conversations SET status = ?, escalationReason = ?, draftReply = ?, updatedAt = ? WHERE id = ?").run(
    status, reason, draftReply ?? null, now(), conversationId,
  );
}

export async function appendSummaryAction(
  conversationId: string,
  action: SummaryAction,
  nextAction?: string,
): Promise<void> {
  const conv = getConversation(conversationId);
  if (!conv?.summary) return;
  await saveSummary(conversationId, {
    ...conv.summary,
    actions: [...conv.summary.actions, action],
    ...(nextAction ? { nextAction } : {}),
  });
}

export async function approveDraft(conversationId: string): Promise<string | null> {
  const conv = getConversation(conversationId);
  if (!conv) return null;
  // Escalated conversations hand off to a specialist team → transferred, not resolved
  const finalStatus = conv.status === "escalated" ? "transferred" : "resolved";
  db.prepare("UPDATE conversations SET status = ?, draftReply = NULL, updatedAt = ? WHERE id = ?").run(finalStatus, now(), conversationId);
  return conv.draftReply ?? null;
}

/** When `scopeToRepId` is set, only conversations assigned to that rep are returned.
 *  Used to scope a rep's view server-side so they can't see anyone else's pipeline. */
export function listConversations(status?: string, scopeToRepId?: string): Conversation[] {
  const where: string[] = [];
  const params: string[] = [];
  if (status) { where.push("status = ?"); params.push(status); }
  if (scopeToRepId) { where.push("assignedRepId = ?"); params.push(scopeToRepId); }
  const sql = `SELECT * FROM conversations${where.length ? " WHERE " + where.join(" AND ") : ""} ORDER BY updatedAt DESC`;
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(rowToConversation);
}

/** When `scopeToRepId` is set, a conversation assigned to a different rep returns null
 *  (looks indistinguishable from "not found" so we don't leak existence). */
export function getConversation(id: string, scopeToRepId?: string): Conversation | null {
  const row = db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as Record<string, unknown> | null;
  if (!row) return null;
  if (scopeToRepId && row["assignedRepId"] !== scopeToRepId) return null;
  return rowToConversation(row);
}

export async function saveCustomReply(conversationId: string, body: string): Promise<void> {
  await appendMessage(conversationId, { role: "assistant", content: `[Human override] ${body}`, timestamp: now() });
  const conv = getConversation(conversationId);
  const finalStatus = conv?.status === "escalated" ? "transferred" : "resolved";
  db.prepare("UPDATE conversations SET status = ?, draftReply = NULL, updatedAt = ? WHERE id = ?").run(finalStatus, now(), conversationId);
}

export async function reassignConversation(conversationId: string, repId: string): Promise<void> {
  db.prepare("UPDATE conversations SET assignedRepId = ?, updatedAt = ? WHERE id = ?").run(repId, now(), conversationId);
}

// ── Users ─────────────────────────────────────────────────────────────────────

function rowToUser(row: Record<string, unknown>): UserWithHash {
  return {
    id: row["id"] as string,
    username: row["username"] as string,
    passwordHash: row["passwordHash"] as string,
    role: row["role"] as UserRole,
    repId: (row["repId"] as string | null) ?? undefined,
    createdAt: row["createdAt"] as string,
  };
}

function publicUser(u: UserWithHash): User {
  const { passwordHash: _hash, ...rest } = u;
  void _hash;
  return rest;
}

export function getUserByUsername(username: string): UserWithHash | null {
  const row = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as Record<string, unknown> | null;
  return row ? rowToUser(row) : null;
}

export function getUserById(id: string): User | null {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Record<string, unknown> | null;
  return row ? publicUser(rowToUser(row)) : null;
}

export function createUser(username: string, passwordHash: string, role: UserRole, repId?: string): User {
  const id = `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const ts = now();
  db.prepare(
    "INSERT INTO users (id, username, passwordHash, role, repId, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, username, passwordHash, role, repId ?? null, ts);
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Record<string, unknown>;
  return publicUser(rowToUser(row));
}

export function hasAnyAdmin(): boolean {
  const row = db.prepare("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1").get();
  return row !== null;
}

export function updateUserPassword(userId: string, passwordHash: string): boolean {
  const r = db.prepare("UPDATE users SET passwordHash = ? WHERE id = ?").run(passwordHash, userId);
  return r.changes > 0;
}
