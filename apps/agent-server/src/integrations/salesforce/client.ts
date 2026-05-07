import type { Lead, Opportunity, LeadStatus, DealStage } from "../../types/index.js";
import type { SalesforceContact, SalesforceOpportunity } from "./types.js";

// Seed data — swap this module for a real Salesforce REST client when ready
const MOCK_CONTACTS: SalesforceContact[] = [
  {
    Id: "sf_001",
    Name: "Alex Rivera",
    Email: "alex.rivera@acme.com",
    Title: "VP of Engineering",
    AccountId: "acc_001",
    Account: { Id: "acc_001", Name: "Acme Corp", Industry: "Software", NumberOfEmployees: 500 },
    LeadSource: "Inbound",
    Status__c: "new",
  },
  {
    Id: "sf_002",
    Name: "Jordan Kim",
    Email: "jordan.kim@globex.io",
    Title: "CTO",
    AccountId: "acc_002",
    Account: { Id: "acc_002", Name: "Globex Industries", Industry: "Manufacturing", NumberOfEmployees: 2000 },
    LeadSource: "Website",
    Status__c: "contacted",
  },
];

const MOCK_OPPORTUNITIES: SalesforceOpportunity[] = [
  { Id: "opp_001", Name: "Acme Corp — Platform", AccountId: "acc_001", StageName: "Qualification", Amount: 48000, CloseDate: "2026-06-30" },
  { Id: "opp_002", Name: "Globex — Enterprise", AccountId: "acc_002", StageName: "Prospecting", Amount: 120000, CloseDate: "2026-08-31" },
];

function toLeadStatus(raw: string): LeadStatus {
  const valid: LeadStatus[] = ["new", "contacted", "qualified", "unqualified", "converted"];
  return valid.includes(raw as LeadStatus) ? (raw as LeadStatus) : "new";
}

function toDealStage(raw: string): DealStage {
  const map: Record<string, DealStage> = {
    Prospecting: "prospecting",
    Qualification: "qualification",
    Proposal: "proposal",
    Negotiation: "negotiation",
    "Closed Won": "closed_won",
    "Closed Lost": "closed_lost",
  };
  return map[raw] ?? "prospecting";
}

export async function getContact(email: string): Promise<Lead | null> {
  const contact = MOCK_CONTACTS.find((c) => c.Email.toLowerCase() === email.toLowerCase());
  if (!contact) return null;
  return {
    id: contact.Id,
    name: contact.Name,
    email: contact.Email,
    company: contact.Account.Name,
    title: contact.Title,
    accountId: contact.AccountId,
    status: toLeadStatus(contact.Status__c),
    industry: contact.Account.Industry,
    employeeCount: contact.Account.NumberOfEmployees,
  };
}

export async function getOpportunities(accountId: string): Promise<Opportunity[]> {
  return MOCK_OPPORTUNITIES.filter((o) => o.AccountId === accountId).map((o) => ({
    id: o.Id,
    accountId: o.AccountId,
    name: o.Name,
    stage: toDealStage(o.StageName),
    amount: o.Amount,
    closeDate: o.CloseDate,
  }));
}

export async function updateLeadStatus(leadId: string, status: LeadStatus): Promise<void> {
  const contact = MOCK_CONTACTS.find((c) => c.Id === leadId);
  if (contact) {
    contact.Status__c = status;
    console.log(`[Salesforce] Updated lead ${leadId} status → ${status}`);
  }
}
