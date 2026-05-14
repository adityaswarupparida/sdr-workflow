import { describe, test, expect } from "bun:test";

// No HubSpot token → mock path runs
delete process.env["HUBSPOT_ACCESS_TOKEN"];

const { upsertContact, logEmailActivity } = await import("../integrations/hubspot/client.js");

const MOCK_LEAD = {
  id: "sf_001",
  name: "Sarah Johnson",
  email: "sarah.johnson@testcorp.com",
  company: "Test Corp",
  title: "VP Sales",
  accountId: "acc_test",
  status: "new" as const,
};

describe("upsertContact (mock path)", () => {
  test("creates a new contact and returns it", async () => {
    const contact = await upsertContact(MOCK_LEAD);
    expect(contact.id).toBeDefined();
    expect(contact.properties.email).toBe("sarah.johnson@testcorp.com");
    expect(contact.properties.company).toBe("Test Corp");
  });

  test("splits name into firstname and lastname", async () => {
    const contact = await upsertContact(MOCK_LEAD);
    expect(contact.properties.firstname).toBe("Sarah");
    expect(contact.properties.lastname).toBe("Johnson");
  });

  test("returns same id on second upsert (update, not create)", async () => {
    const first = await upsertContact(MOCK_LEAD);
    const second = await upsertContact(MOCK_LEAD);
    expect(first.id).toBe(second.id);
  });

  test("handles single-word name", async () => {
    const contact = await upsertContact({ ...MOCK_LEAD, name: "Cher", email: "cher@unique.com" });
    expect(contact.properties.firstname).toBe("Cher");
    expect(contact.properties.lastname).toBe("");
  });
});

describe("logEmailActivity (mock path)", () => {
  test("returns activity with correct type and subject", async () => {
    const activity = await logEmailActivity("hs_001", "Follow-up on your inquiry", "Hi Sarah...");
    expect(activity.type).toBe("EMAIL");
    expect(activity.properties.hs_email_subject).toBe("Follow-up on your inquiry");
  });

  test("returns unique activity id each time", async () => {
    const a1 = await logEmailActivity("hs_001", "First", "body");
    const a2 = await logEmailActivity("hs_001", "Second", "body");
    expect(a1.id).not.toBe(a2.id);
  });
});
