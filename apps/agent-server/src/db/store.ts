import { Database } from "bun:sqlite";
import { CREATE_TABLES } from "./schema.js";
import type { Conversation, ConversationMessage, ConversationStatus, EscalationReason } from "../types/index.js";

const db = new Database("sdr.db", { create: true });
db.run("PRAGMA journal_mode=WAL;");
db.exec(CREATE_TABLES);

function now(): string {
  return new Date().toISOString();
}

function rowToConversation(row: Record<string, unknown>): Conversation {
  return {
    id: row["id"] as string,
    threadId: row["threadId"] as string,
    leadEmail: row["leadEmail"] as string,
    leadName: row["leadName"] as string | undefined,
    messages: JSON.parse(row["messages"] as string) as ConversationMessage[],
    status: row["status"] as ConversationStatus,
    escalationReason: row["escalationReason"] as EscalationReason | undefined,
    draftReply: row["draftReply"] as string | undefined,
    createdAt: row["createdAt"] as string,
    updatedAt: row["updatedAt"] as string,
  };
}

export async function getOrCreateConversation(threadId: string, leadEmail: string): Promise<Conversation> {
  const existing = db.prepare("SELECT * FROM conversations WHERE threadId = ?").get(threadId) as Record<string, unknown> | null;
  if (existing) return rowToConversation(existing);

  const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const ts = now();
  db.prepare(
    "INSERT INTO conversations (id, threadId, leadEmail, messages, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(id, threadId, leadEmail, "[]", "active", ts, ts);

  return rowToConversation(db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as Record<string, unknown>);
}

export async function appendMessage(conversationId: string, message: ConversationMessage): Promise<void> {
  const row = db.prepare("SELECT messages FROM conversations WHERE id = ?").get(conversationId) as { messages: string } | null;
  if (!row) throw new Error(`Conversation ${conversationId} not found`);
  const messages = JSON.parse(row.messages) as ConversationMessage[];
  messages.push(message);
  db.prepare("UPDATE conversations SET messages = ?, updatedAt = ? WHERE id = ?").run(
    JSON.stringify(messages),
    now(),
    conversationId,
  );
}

export async function markResolved(conversationId: string): Promise<void> {
  db.prepare("UPDATE conversations SET status = ?, updatedAt = ? WHERE id = ?").run("resolved", now(), conversationId);
}

export async function setEscalated(conversationId: string, reason: EscalationReason, draftReply?: string): Promise<void> {
  db.prepare("UPDATE conversations SET status = ?, escalationReason = ?, draftReply = ?, updatedAt = ? WHERE id = ?").run(
    "pending_review",
    reason,
    draftReply ?? null,
    now(),
    conversationId,
  );
}

export async function approveDraft(conversationId: string): Promise<string | null> {
  const row = db.prepare("SELECT draftReply FROM conversations WHERE id = ?").get(conversationId) as { draftReply: string | null } | null;
  if (!row) return null;
  db.prepare("UPDATE conversations SET status = ?, draftReply = NULL, updatedAt = ? WHERE id = ?").run("resolved", now(), conversationId);
  return row.draftReply;
}

export function listConversations(status?: string): Conversation[] {
  const rows = status
    ? (db.prepare("SELECT * FROM conversations WHERE status = ? ORDER BY updatedAt DESC").all(status) as Record<string, unknown>[])
    : (db.prepare("SELECT * FROM conversations ORDER BY updatedAt DESC").all() as Record<string, unknown>[]);
  return rows.map(rowToConversation);
}

export function getConversation(id: string): Conversation | null {
  const row = db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as Record<string, unknown> | null;
  return row ? rowToConversation(row) : null;
}

export async function saveCustomReply(conversationId: string, body: string): Promise<void> {
  await appendMessage(conversationId, {
    role: "assistant",
    content: `[Human override] ${body}`,
    timestamp: now(),
  });
  db.prepare("UPDATE conversations SET status = ?, draftReply = NULL, updatedAt = ? WHERE id = ?").run("resolved", now(), conversationId);
}
