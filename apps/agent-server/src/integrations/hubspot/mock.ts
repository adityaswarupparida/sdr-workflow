import type { Lead } from "../../types/index.js";
import type { HubSpotContact, HubSpotActivity } from "./types.js";

export const mockContacts = new Map<string, HubSpotContact>();
export const mockActivities: HubSpotActivity[] = [];
let mockActivityCounter = 0;

export function mockUpsertContact(lead: Lead): HubSpotContact {
  const existing = mockContacts.get(lead.email);
  const [firstname, ...rest] = lead.name.split(" ");
  const contact: HubSpotContact = {
    id: existing?.id ?? `hs_${Date.now()}`,
    properties: { firstname: firstname ?? "", lastname: rest.join(" "), email: lead.email, company: lead.company, jobtitle: lead.title, lifecyclestage: "lead" },
  };
  mockContacts.set(lead.email, contact);
  console.log(`[HubSpot] Mock upsert contact: ${lead.email}`);
  return contact;
}

export function mockLogEmailActivity(contactId: string, subject: string, body: string): HubSpotActivity {
  const activity: HubSpotActivity = {
    id: `act_${Date.now()}_${++mockActivityCounter}`,
    type: "EMAIL",
    properties: { hs_email_subject: subject, hs_email_text: body, hs_timestamp: new Date().toISOString() },
  };
  mockActivities.push(activity);
  console.log(`[HubSpot] Mock log activity for contact ${contactId}: "${subject}"`);
  return activity;
}

export function mockUpdateDealStage(contactId: string, stage: string): void {
  console.log(`[HubSpot] Mock deal stage update for contact ${contactId} → ${stage}`);
}

export function mockGetContactByEmail(email: string): HubSpotContact | undefined {
  return mockContacts.get(email);
}
