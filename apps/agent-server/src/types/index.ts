export type LeadStatus = "new" | "contacted" | "qualified" | "unqualified" | "converted";
export type DealStage = "prospecting" | "qualification" | "proposal" | "negotiation" | "closed_won" | "closed_lost";
export type ConversationStatus = "active" | "pending_review" | "resolved" | "escalated" | "follow_up_pending" | "transferred";
export type EscalationReason =
  | "pricing_or_quote"
  | "technical_deep_dive"
  | "existing_customer"
  | "legal_or_contract"
  | "low_confidence";

export interface Lead {
  id: string;
  name: string;
  email: string;
  company: string;
  title: string;
  accountId: string;
  status: LeadStatus;
  industry?: string;
  employeeCount?: number;
}

export interface Opportunity {
  id: string;
  accountId: string;
  name: string;
  stage: DealStage;
  amount?: number;
  closeDate?: string;
}

export interface ConversationMessage {
  role: "user" | "assistant" | "tool_use" | "tool_result";
  content: string;
  toolName?: string;
  toolInput?: unknown;
  toolResult?: unknown;
  timestamp: string;
}

export interface Conversation {
  id: string;
  threadId: string;
  leadEmail: string;
  leadName?: string;
  messages: ConversationMessage[];
  status: ConversationStatus;
  escalationReason?: EscalationReason;
  draftReply?: string;
  assignedRepId?: string;
  assignedRep?: SalesRep;
  summary?: ConversationSummary;
  createdAt: string;
  updatedAt: string;
}

export interface InboundEmail {
  from: string;
  subject: string;
  body: string;
  threadId?: string;
  messageId?: string;
  receivedAt: string;
}

export interface SalesRep {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: string;
}

export interface SummaryAction {
  step: string;
  detail: string;
}

export interface ConversationSummary {
  leadStatus: "new" | "contacted" | "qualified" | "unqualified";
  actions: SummaryAction[];
  notes?: string;
  nextAction?: string;
}

export interface AgentOutcome {
  conversationId: string;
  escalated: boolean;
  escalationReason?: EscalationReason;
  draftReply?: string;
  emailSent: boolean;
  hubspotLogged: boolean;
  followupScheduled?: { daysFromNow: number; reason: string };
  summary?: ConversationSummary;
}

export type UserRole = "admin" | "manager" | "rep";

export interface User {
  id: string;
  username: string;
  role: UserRole;
  repId?: string;
  createdAt: string;
}

/** Internal — never returned through the API. */
export interface UserWithHash extends User {
  passwordHash: string;
}

/** Payload encoded in the JWT and attached to a request after auth middleware. */
export interface AuthContext {
  userId: string;
  username: string;
  role: UserRole;
  repId?: string;
}
