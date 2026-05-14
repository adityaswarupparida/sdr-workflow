import { describe, test, expect, beforeAll, afterAll } from "bun:test";

delete process.env["SF_CLIENT_ID"];
delete process.env["HUBSPOT_ACCESS_TOKEN"];
delete process.env["POSTMARK_SERVER_TOKEN"];

// Isolate any queue traffic this test file produces from real workers on the same
// Redis (e.g. a local `bun dev` server). Must be set before the queue module loads.
// followup.integration.test.ts uses the same name so both files share one test queue.
process.env["FOLLOWUP_QUEUE_NAME"] = "sdr-followups-test";

const { dispatchTool } = await import("../agent/dispatcher.js");

describe("dispatchTool — salesforce", () => {
  test("salesforce_get_contact returns lead for known email", async () => {
    const { result } = await dispatchTool("salesforce_get_contact", { email: "alex.rivera@acme.com" });
    const lead = result as { name: string; company: string };
    expect(lead.name).toBe("Alex Rivera");
    expect(lead.company).toBe("Acme Corp");
  });

  test("salesforce_get_contact returns error object for unknown email", async () => {
    const { result } = await dispatchTool("salesforce_get_contact", { email: "ghost@nowhere.com" });
    expect((result as { error: string }).error).toContain("not found");
  });

  test("salesforce_get_opportunities returns array for known accountId", async () => {
    const { result } = await dispatchTool("salesforce_get_opportunities", { accountId: "acc_001" });
    expect(Array.isArray(result)).toBe(true);
    expect((result as unknown[]).length).toBeGreaterThan(0);
  });
});

describe("dispatchTool — hubspot", () => {
  test("hubspot_upsert_contact returns contactId", async () => {
    const { result } = await dispatchTool("hubspot_upsert_contact", {
      email: "test@example.com", name: "Test User", company: "TestCo", title: "Engineer",
    });
    expect((result as { contactId: string; success: boolean }).success).toBe(true);
    expect(typeof (result as { contactId: string }).contactId).toBe("string");
  });

  test("hubspot_log_activity returns activityId", async () => {
    const { result } = await dispatchTool("hubspot_log_activity", {
      contactId: "hs_001", subject: "Demo sent", body: "Hi there",
    });
    expect((result as { success: boolean }).success).toBe(true);
  });
});

describe("dispatchTool — email", () => {
  test("send_email returns messageId (mock)", async () => {
    const { result } = await dispatchTool("send_email", {
      to: "prospect@acme.com", subject: "Following up", body: "Just checking in",
    });
    expect(typeof (result as { messageId: string }).messageId).toBe("string");
  });

  test("send_email includes CC when repEmail provided", async () => {
    const { result } = await dispatchTool(
      "send_email",
      { to: "prospect@acme.com", subject: "Hi", body: "Hello" },
      "rep@company.com",
    );
    expect((result as { messageId: string }).messageId).toBeDefined();
  });
});

describe("dispatchTool — scheduling", () => {
  // Force scheduleFollowup's noop branch so this unit test doesn't require Redis.
  // Scoped to this describe so the integration test (run later in the suite) still
  // sees REDIS_URL set when its tests execute.
  let savedRedisUrl: string | undefined;
  beforeAll(() => {
    savedRedisUrl = process.env["REDIS_URL"];
    delete process.env["REDIS_URL"];
  });
  afterAll(() => {
    if (savedRedisUrl !== undefined) process.env["REDIS_URL"] = savedRedisUrl;
  });

  test("schedule_followup returns scheduled: true", async () => {
    const { result } = await dispatchTool("schedule_followup", {
      leadId: "sf_001", daysFromNow: 3, reason: "No response yet",
    });
    expect((result as { scheduled: boolean; daysFromNow: number }).scheduled).toBe(true);
    expect((result as { daysFromNow: number }).daysFromNow).toBe(3);
  });
});

describe("dispatchTool — escalation", () => {
  test("escalate_to_human returns escalation object", async () => {
    const { result, escalation } = await dispatchTool("escalate_to_human", {
      reason: "pricing_or_quote", draftReply: "Thanks for asking about pricing...", urgency: "high",
    });
    expect((result as { escalated: boolean }).escalated).toBe(true);
    expect(escalation?.reason).toBe("pricing_or_quote");
    expect(escalation?.draftReply).toContain("pricing");
    expect(escalation?.urgency).toBe("high");
  });

  test("escalate_to_human works without draftReply", async () => {
    const { escalation } = await dispatchTool("escalate_to_human", {
      reason: "low_confidence", urgency: "low",
    });
    expect(escalation?.reason).toBe("low_confidence");
    expect(escalation?.draftReply).toBeUndefined();
  });
});

describe("dispatchTool — unknown tool", () => {
  test("returns error for unrecognised tool name", async () => {
    const { result } = await dispatchTool("nonexistent_tool", {});
    expect((result as { error: string }).error).toContain("Unknown tool");
  });
});
