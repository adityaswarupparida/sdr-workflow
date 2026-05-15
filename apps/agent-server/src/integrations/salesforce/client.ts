import type { Lead, Opportunity, LeadStatus, DealStage } from "../../types/index.js";
import { mockGetContact, mockGetOpportunities, mockUpdateLeadStatus, mockCreateContact } from "./mock.js";

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

// Look up a Salesforce Account by name. Returns the Account ID or null.
async function findAccountByName(name: string): Promise<string | null> {
  const records = await sfQuery<{ Id: string }>(
    `SELECT Id FROM Account WHERE Name = '${name.replace(/'/g, "\\'")}' LIMIT 1`
  );
  return records[0]?.Id ?? null;
}

// Create a new Salesforce Account and return its ID.
async function createAccount(name: string): Promise<string> {
  const token = await getAccessToken();
  const res = await fetch(`${token.instanceUrl}/services/data/v59.0/sobjects/Account`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ Name: name }),
  });
  if (!res.ok) throw new Error(`Salesforce create account failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { id: string };
  console.log(`[Salesforce] Created account: "${name}" (id: ${data.id})`);
  return data.id;
}

// Find or create an Account, then create a Contact linked to it.
export async function createContact(fields: {
  email: string; firstName: string; lastName: string; company: string; title?: string;
}): Promise<Lead> {
  if (!isConfigured()) return mockCreateContact(fields);

  // 1. Resolve account — find existing or create new
  let accountId = await findAccountByName(fields.company);
  if (!accountId) {
    accountId = await createAccount(fields.company);
  }

  // 2. Create contact linked to the account
  const token = await getAccessToken();
  const body: Record<string, string> = {
    FirstName: fields.firstName,
    LastName: fields.lastName,
    Email: fields.email,
    AccountId: accountId,
  };
  if (fields.title) body["Title"] = fields.title;

  const res = await fetch(`${token.instanceUrl}/services/data/v59.0/sobjects/Contact`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Salesforce create contact failed: ${res.status} ${await res.text()}`);

  const data = await res.json() as { id: string };
  console.log(`[Salesforce] Created contact: ${fields.email} (id: ${data.id}, accountId: ${accountId})`);

  return {
    id: data.id,
    name: `${fields.firstName} ${fields.lastName}`.trim(),
    email: fields.email,
    company: fields.company,
    title: fields.title ?? "",
    accountId,
    status: "new",
  };
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
