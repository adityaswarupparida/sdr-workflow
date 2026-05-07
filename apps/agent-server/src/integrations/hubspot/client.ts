import type { Lead } from "../../types/index.js";
import type { HubSpotContact, HubSpotActivity } from "./types.js";

// In-memory store — swap with real HubSpot API client when ready
const contacts = new Map<string, HubSpotContact>();
const activities: HubSpotActivity[] = [];

export async function upsertContact(lead: Lead): Promise<HubSpotContact> {
  const existing = contacts.get(lead.email);
  const [firstname, ...rest] = lead.name.split(" ");
  const contact: HubSpotContact = {
    id: existing?.id ?? `hs_${Date.now()}`,
    properties: {
      firstname: firstname ?? "",
      lastname: rest.join(" "),
      email: lead.email,
      company: lead.company,
      jobtitle: lead.title,
      lifecyclestage: "lead",
    },
  };
  contacts.set(lead.email, contact);
  console.log(`[HubSpot] Upserted contact: ${lead.email} (id: ${contact.id})`);
  return contact;
}

export async function logEmailActivity(contactId: string, subject: string, body: string): Promise<HubSpotActivity> {
  const activity: HubSpotActivity = {
    id: `act_${Date.now()}`,
    type: "EMAIL",
    properties: {
      hs_email_subject: subject,
      hs_email_text: body,
      hs_timestamp: new Date().toISOString(),
    },
  };
  activities.push(activity);
  console.log(`[HubSpot] Logged email activity for contact ${contactId}: "${subject}"`);
  return activity;
}

export async function updateDealStage(contactId: string, stage: string): Promise<void> {
  console.log(`[HubSpot] Updated deal stage for contact ${contactId} → ${stage}`);
}

export function getContactByEmail(email: string): HubSpotContact | undefined {
  return contacts.get(email);
}
