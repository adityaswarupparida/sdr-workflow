import { describe, test, expect } from "bun:test";
import { SYSTEM_PROMPT, repContext } from "../agent/system-prompt.js";

describe("SYSTEM_PROMPT", () => {
  test("contains SDR role definition", () => {
    expect(SYSTEM_PROMPT).toContain("SDR");
  });

  test("contains Salesforce lookup instruction", () => {
    expect(SYSTEM_PROMPT).toContain("salesforce_get_contact");
  });

  test("contains HubSpot logging instruction", () => {
    expect(SYSTEM_PROMPT).toContain("hubspot_log_activity");
  });

  test("contains all five escalation reasons", () => {
    expect(SYSTEM_PROMPT).toContain("pricing_or_quote");
    expect(SYSTEM_PROMPT).toContain("technical_deep_dive");
    expect(SYSTEM_PROMPT).toContain("existing_customer");
    expect(SYSTEM_PROMPT).toContain("legal_or_contract");
    expect(SYSTEM_PROMPT).toContain("low_confidence");
  });

  test("instructs agent NOT to send email when escalating", () => {
    expect(SYSTEM_PROMPT).toContain("Do NOT call send_email");
  });
});

describe("repContext", () => {
  test("includes rep name", () => {
    const ctx = repContext("Sarah Chen", "sarah@co.com");
    expect(ctx).toContain("Sarah Chen");
  });

  test("includes rep email", () => {
    const ctx = repContext("Sarah Chen", "sarah@co.com");
    expect(ctx).toContain("sarah@co.com");
  });

  test("instructs agent to sign as rep", () => {
    const ctx = repContext("Marcus Webb", "marcus@co.com");
    expect(ctx).toContain("Marcus Webb");
    expect(ctx.toLowerCase()).toContain("sign");
  });

  test("includes today's date", () => {
    const ctx = repContext("A", "a@b.com");
    const today = new Date().toISOString().split("T")[0]!;
    expect(ctx).toContain(today);
  });
});
