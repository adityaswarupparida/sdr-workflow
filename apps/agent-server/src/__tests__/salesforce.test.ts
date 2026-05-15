import { describe, test, expect } from "bun:test";

// No SF credentials set → mock path runs
delete process.env["SF_CLIENT_ID"];
delete process.env["SF_REFRESH_TOKEN"];

const { getContact, getOpportunities, updateLeadStatus, createContact } = await import("../integrations/salesforce/client.js");
const { MOCK_LEADS, MOCK_ACCOUNTS } = await import("../integrations/salesforce/mock.js");
const { dispatchTool } = await import("../agent/dispatcher.js");

// Reduces boilerplate in tests that only care about one field, not the full object shape
function mkContact(overrides: { email: string; company: string; firstName?: string; lastName?: string; title?: string }) {
  return createContact({
    firstName: "Test",
    lastName: "User",
    ...overrides,
  });
}

// ── getContact ────────────────────────────────────────────────────────────────

describe("getContact (mock path)", () => {
  test("returns lead for known email", async () => {
    const lead = await getContact("alex.rivera@acme.com");
    expect(lead).not.toBeNull();
    expect(lead?.name).toBe("Alex Rivera");
    expect(lead?.company).toBe("Acme Corp");
    expect(lead?.accountId).toBe("acc_001");
  });

  test("returns null for unknown email", async () => {
    const lead = await getContact("nobody@unknown.com");
    expect(lead).toBeNull();
  });

  test("is case-insensitive", async () => {
    const lead = await getContact("ALEX.RIVERA@ACME.COM");
    expect(lead?.name).toBe("Alex Rivera");
  });
});

// ── getOpportunities ──────────────────────────────────────────────────────────

describe("getOpportunities (mock path)", () => {
  test("returns opportunities for known accountId", async () => {
    const opps = await getOpportunities("acc_001");
    expect(opps.length).toBeGreaterThan(0);
    expect(opps[0]?.accountId).toBe("acc_001");
    expect(opps[0]?.amount).toBeGreaterThan(0);
  });

  test("returns empty array for unknown accountId", async () => {
    const opps = await getOpportunities("acc_999");
    expect(opps).toHaveLength(0);
  });

  test("returns correct deal stage", async () => {
    const opps = await getOpportunities("acc_001");
    expect(opps[0]?.stage).toBe("qualification");
  });
});

// ── updateLeadStatus ──────────────────────────────────────────────────────────

describe("updateLeadStatus (mock path)", () => {
  test("updates status without throwing", async () => {
    await expect(updateLeadStatus("sf_001", "contacted")).resolves.toBeUndefined();
  });
});

// ── createContact ─────────────────────────────────────────────────────────────

describe("createContact (mock path)", () => {
  test("creates a new contact and returns a lead", async () => {
    const lead = await createContact({
      email: "new.person@startup.io",
      firstName: "New",
      lastName: "Person",
      company: "StartupIO",
    });
    expect(lead.email).toBe("new.person@startup.io");
    expect(lead.name).toBe("New Person");
    expect(lead.company).toBe("StartupIO");
    expect(lead.id).toBeDefined();
    expect(lead.accountId).toBeDefined();
    expect(lead.status).toBe("new");
  });

  test("creates a new account when company does not exist", async () => {
    const countBefore = MOCK_ACCOUNTS.length;
    await mkContact({ email: "founder@brandnew.dev", company: "BrandNewCompany" });
    expect(MOCK_ACCOUNTS.length).toBe(countBefore + 1);
    expect(MOCK_ACCOUNTS.find(a => a.name === "BrandNewCompany")).toBeDefined();
  });

  test("reuses existing account when company already exists", async () => {
    // Acme Corp is a seed account (acc_001) — must not create a duplicate
    const countBefore = MOCK_ACCOUNTS.length;
    const lead = await mkContact({ email: "another.acme@acme.com", company: "Acme Corp" });
    expect(MOCK_ACCOUNTS.length).toBe(countBefore);
    expect(lead.accountId).toBe("acc_001");
  });

  test("account lookup is case-insensitive", async () => {
    const countBefore = MOCK_ACCOUNTS.length;
    const lead = await mkContact({ email: "user@globex.io", company: "GLOBEX INDUSTRIES" });
    expect(MOCK_ACCOUNTS.length).toBe(countBefore);
    expect(lead.accountId).toBe("acc_002");
  });

  test("contact includes title when provided", async () => {
    const lead = await mkContact({ email: "cto@newco.com", company: "NewCo", title: "CTO" });
    expect(lead.title).toBe("CTO");
  });

  test("returns existing contact without duplicating if email already exists", async () => {
    const countBefore = MOCK_LEADS.length;
    const lead = await mkContact({ email: "alex.rivera@acme.com", company: "Acme Corp" });
    expect(MOCK_LEADS.length).toBe(countBefore);
    expect(lead.id).toBe("sf_001");
  });

  test("new contact appears in subsequent getContact lookups", async () => {
    await mkContact({ email: "fresh.lead@testsuite.io", company: "TestSuite" });
    const found = await getContact("fresh.lead@testsuite.io");
    expect(found).not.toBeNull();
    expect(found?.name).toBe("Test User");
    expect(found?.company).toBe("TestSuite");
  });

  test("new contact's accountId links to its company opportunities", async () => {
    const lead = await mkContact({ email: "sales@megacorp.io", company: "MegaCorp" });
    // New account has no opportunities yet
    const opps = await getOpportunities(lead.accountId);
    expect(opps).toHaveLength(0);
  });
});

// ── dispatcher ────────────────────────────────────────────────────────────────

describe("dispatcher — salesforce_create_contact", () => {
  async function dispatchCreate(fields: Parameters<typeof createContact>[0]) {
    return dispatchTool("salesforce_create_contact", fields as Record<string, unknown>);
  }

  test("returns lead with correct fields", async () => {
    const { result } = await dispatchCreate({
      email: "dispatcher@test.io", firstName: "Dispatch", lastName: "User", company: "DispatchCo",
    });
    const lead = result as { email: string; name: string; accountId: string };
    expect(lead.email).toBe("dispatcher@test.io");
    expect(lead.name).toBe("Dispatch User");
    expect(lead.accountId).toBeDefined();
  });

  test("creates account then contact — full chain", async () => {
    const accountsBefore = MOCK_ACCOUNTS.length;
    const leadsBefore    = MOCK_LEADS.length;

    await dispatchCreate({
      email: "ceo@chaintest.io", firstName: "Chain", lastName: "CEO", company: "ChainTestCorp",
    });

    expect(MOCK_ACCOUNTS.length).toBe(accountsBefore + 1);
    expect(MOCK_LEADS.length).toBe(leadsBefore + 1);

    const found = await getContact("ceo@chaintest.io");
    expect(found?.company).toBe("ChainTestCorp");
    expect(found?.accountId).toBe(MOCK_ACCOUNTS.find(a => a.name === "ChainTestCorp")?.id);
  });
});
