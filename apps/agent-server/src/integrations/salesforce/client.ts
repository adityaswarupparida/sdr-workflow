import type { Lead, Opportunity, LeadStatus, DealStage } from "../../types/index.js";
import { mockGetContact, mockGetOpportunities, mockUpdateLeadStatus } from "./mock.js";

// ── Token management ──────────────────────────────────────────────────────────

interface SFToken {
  accessToken: string;
  instanceUrl: string;
  expiresAt: number;
}

let cachedToken: SFToken | null = null;

async function getAccessToken(): Promise<SFToken> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 5 * 60 * 1000) {
    return cachedToken;
  }

  const clientId = process.env["SF_CLIENT_ID"];
  const clientSecret = process.env["SF_CLIENT_SECRET"];
  const refreshToken = process.env["SF_REFRESH_TOKEN"];
  const loginUrl = process.env["SF_LOGIN_URL"] ?? "https://login.salesforce.com";

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Salesforce credentials not configured (SF_CLIENT_ID, SF_CLIENT_SECRET, SF_REFRESH_TOKEN)");
  }

  const res = await fetch(`${loginUrl}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) throw new Error(`Salesforce token refresh failed: ${await res.text()}`);

  const data = await res.json() as { access_token: string; instance_url: string };
  cachedToken = {
    accessToken: data.access_token,
    instanceUrl: data.instance_url,
    expiresAt: Date.now() + 2 * 60 * 60 * 1000,
  };

  console.log(`[Salesforce] Token refreshed, instance: ${cachedToken.instanceUrl}`);
  return cachedToken;
}

async function sfQuery<T>(soql: string): Promise<T[]> {
  const token = await getAccessToken();
  const url = `${token.instanceUrl}/services/data/v59.0/query?q=${encodeURIComponent(soql)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token.accessToken}` } });
  if (!res.ok) throw new Error(`Salesforce query failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { records: T[] };
  return data.records;
}

function isConfigured(): boolean {
  return Boolean(process.env["SF_CLIENT_ID"] && process.env["SF_REFRESH_TOKEN"]);
}

function toDealStage(raw: string): DealStage {
  const map: Record<string, DealStage> = {
    Prospecting: "prospecting", Qualification: "qualification",
    Proposal: "proposal", Negotiation: "negotiation",
    "Closed Won": "closed_won", "Closed Lost": "closed_lost",
  };
  return map[raw] ?? "prospecting";
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getContact(email: string): Promise<Lead | null> {
  if (!isConfigured()) return mockGetContact(email);

  const records = await sfQuery<{
    Id: string; Name: string; Email: string; Title: string; AccountId: string;
    Account: { Name: string; Industry: string; NumberOfEmployees: number };
  }>(
    `SELECT Id, Name, Email, Title, AccountId,
            Account.Name, Account.Industry, Account.NumberOfEmployees
     FROM Contact WHERE Email = '${email.replace(/'/g, "\\'")}'
     LIMIT 1`
  );

  if (!records.length) return null;
  const r = records[0]!;
  return {
    id: r.Id, name: r.Name, email: r.Email, title: r.Title,
    accountId: r.AccountId, status: "new",
    company: r.Account.Name, industry: r.Account.Industry,
    employeeCount: r.Account.NumberOfEmployees,
  };
}

export async function getOpportunities(accountId: string): Promise<Opportunity[]> {
  if (!isConfigured()) return mockGetOpportunities(accountId);

  const records = await sfQuery<{
    Id: string; Name: string; AccountId: string; StageName: string; Amount: number; CloseDate: string;
  }>(
    `SELECT Id, Name, AccountId, StageName, Amount, CloseDate
     FROM Opportunity WHERE AccountId = '${accountId}' AND IsClosed = false`
  );

  return records.map((r) => ({
    id: r.Id, accountId: r.AccountId, name: r.Name,
    stage: toDealStage(r.StageName), amount: r.Amount, closeDate: r.CloseDate,
  }));
}

export async function updateLeadStatus(leadId: string, status: LeadStatus): Promise<void> {
  if (!isConfigured()) return mockUpdateLeadStatus(leadId, status);

  const token = await getAccessToken();
  await fetch(`${token.instanceUrl}/services/data/v59.0/sobjects/Contact/${leadId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ Status__c: status }),
  });
}
