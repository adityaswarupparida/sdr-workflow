import { describe, test, expect, beforeEach } from "bun:test";

// No SF credentials set → mock path runs
delete process.env["SF_CLIENT_ID"];
delete process.env["SF_REFRESH_TOKEN"];

const { getContact, getOpportunities, updateLeadStatus } = await import("../integrations/salesforce/client.js");

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

describe("updateLeadStatus (mock path)", () => {
  test("updates status without throwing", async () => {
    await expect(updateLeadStatus("sf_001", "contacted")).resolves.toBeUndefined();
  });
});
