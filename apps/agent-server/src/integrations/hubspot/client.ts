import type { Lead } from "../../types/index.js";
import type { HubSpotContact, HubSpotActivity } from "./types.js";
import { mockUpsertContact, mockLogEmailActivity, mockUpdateDealStage, mockGetContactByEmail } from "./mock.js";

const HS_TOKEN = process.env["HUBSPOT_ACCESS_TOKEN"];
const HS_BASE = "https://api.hubapi.com";

function isConfigured(): boolean {
  return Boolean(HS_TOKEN);
}

function hsHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${HS_TOKEN}`,
    "Content-Type": "application/json",
  };
}

// ── Contact ───────────────────────────────────────────────────────────────────

async function searchContactByEmail(email: string): Promise<HubSpotContact | null> {
  const res = await fetch(`${HS_BASE}/crm/v3/objects/contacts/search`, {
    method: "POST",
    headers: hsHeaders(),
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
      properties: ["firstname", "lastname", "email", "company", "jobtitle", "lifecyclestage"],
      limit: 1,
    }),
  });
  if (!res.ok) throw new Error(`HubSpot search failed: ${res.status}`);
  const data = await res.json() as { results: HubSpotContact[] };
  return data.results[0] ?? null;
}

export async function upsertContact(lead: Lead): Promise<HubSpotContact> {
  if (!isConfigured()) return mockUpsertContact(lead);

  const [firstname, ...rest] = lead.name.split(" ");
  const properties = { firstname: firstname ?? "", lastname: rest.join(" "), email: lead.email, company: lead.company, jobtitle: lead.title, lifecyclestage: "lead" };

  const existing = await searchContactByEmail(lead.email);

  if (existing) {
    await fetch(`${HS_BASE}/crm/v3/objects/contacts/${existing.id}`, {
      method: "PATCH",
      headers: hsHeaders(),
      body: JSON.stringify({ properties }),
    });
    console.log(`[HubSpot] Updated contact: ${lead.email} (id: ${existing.id})`);
    return { ...existing, properties: { ...existing.properties, ...properties } };
  }

  const res = await fetch(`${HS_BASE}/crm/v3/objects/contacts`, {
    method: "POST",
    headers: hsHeaders(),
    body: JSON.stringify({ properties }),
  });
  if (!res.ok) throw new Error(`HubSpot create contact failed: ${res.status} ${await res.text()}`);
  const created = await res.json() as HubSpotContact;
  console.log(`[HubSpot] Created contact: ${lead.email} (id: ${created.id})`);
  return created;
}

// ── Email activity ────────────────────────────────────────────────────────────

export async function logEmailActivity(contactId: string, subject: string, body: string): Promise<HubSpotActivity> {
  if (!isConfigured()) return mockLogEmailActivity(contactId, subject, body);

  try {
    const res = await fetch(`${HS_BASE}/crm/v3/objects/emails`, {
      method: "POST",
      headers: hsHeaders(),
      body: JSON.stringify({
        properties: { hs_email_direction: "EMAIL", hs_email_status: "SENT", hs_email_subject: subject, hs_email_text: body, hs_timestamp: Date.now() },
        associations: [{ to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 198 }] }],
      }),
    });

    if (!res.ok) {
      console.warn(`[HubSpot] Activity logging skipped (scope not available): ${res.status}`);
      return { id: `skipped_${Date.now()}`, type: "EMAIL", properties: { hs_email_subject: subject, hs_email_text: body, hs_timestamp: new Date().toISOString() } };
    }

    const data = await res.json() as HubSpotActivity;
    console.log(`[HubSpot] Logged email activity for contact ${contactId}: "${subject}"`);
    return data;
  } catch (err) {
    console.warn(`[HubSpot] Activity logging failed silently:`, (err as Error).message);
    return { id: `skipped_${Date.now()}`, type: "EMAIL", properties: { hs_email_subject: subject, hs_email_text: body, hs_timestamp: new Date().toISOString() } };
  }
}

// ── Deal stage ────────────────────────────────────────────────────────────────

export async function updateDealStage(contactId: string, stage: string): Promise<void> {
  if (!isConfigured()) return mockUpdateDealStage(contactId, stage);

  const res = await fetch(`${HS_BASE}/crm/v3/objects/contacts/${contactId}/associations/deals`, { headers: hsHeaders() });
  if (!res.ok) return;
  const data = await res.json() as { results: Array<{ id: string }> };
  for (const deal of data.results) {
    await fetch(`${HS_BASE}/crm/v3/objects/deals/${deal.id}`, {
      method: "PATCH",
      headers: hsHeaders(),
      body: JSON.stringify({ properties: { dealstage: stage } }),
    });
  }
  console.log(`[HubSpot] Updated deal stage for contact ${contactId} → ${stage}`);
}

// Used by approve/reply routes to fetch contact ID before logging activity
export async function getContactByEmail(email: string): Promise<HubSpotContact | undefined> {
  if (!isConfigured()) return mockGetContactByEmail(email);
  return (await searchContactByEmail(email)) ?? undefined;
}
