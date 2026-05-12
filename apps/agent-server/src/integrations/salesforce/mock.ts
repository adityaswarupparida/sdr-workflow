import type { Lead, Opportunity, LeadStatus } from "../../types/index.js";

export const MOCK_LEADS: Lead[] = [
  { id: "sf_001", name: "Alex Rivera", email: "alex.rivera@acme.com", company: "Acme Corp", title: "VP of Engineering", accountId: "acc_001", status: "new", industry: "Software", employeeCount: 500 },
  { id: "sf_002", name: "Jordan Kim", email: "jordan.kim@globex.io", company: "Globex Industries", title: "CTO", accountId: "acc_002", status: "contacted", industry: "Manufacturing", employeeCount: 2000 },
];

export const MOCK_OPPORTUNITIES: Opportunity[] = [
  { id: "opp_001", accountId: "acc_001", name: "Acme Corp — Platform", stage: "qualification", amount: 48000, closeDate: "2026-06-30" },
  { id: "opp_002", accountId: "acc_002", name: "Globex — Enterprise", stage: "prospecting", amount: 120000, closeDate: "2026-08-31" },
];

export function mockGetContact(email: string): Lead | null {
  return MOCK_LEADS.find((l) => l.email.toLowerCase() === email.toLowerCase()) ?? null;
}

export function mockGetOpportunities(accountId: string): Opportunity[] {
  return MOCK_OPPORTUNITIES.filter((o) => o.accountId === accountId);
}

export function mockUpdateLeadStatus(leadId: string, status: LeadStatus): void {
  const lead = MOCK_LEADS.find((l) => l.id === leadId);
  if (lead) lead.status = status;
}
