import { describe, test, expect, afterEach, spyOn } from "bun:test";

const MOCK_REP = {
  id: "rep_001",
  name: "Sarah Chen",
  email: "sarah.chen@co.com",
  isActive: true,
  createdAt: new Date().toISOString(),
};

const BASE_PARAMS = {
  conversationId: "conv_test_123",
  leadEmail: "prospect@acme.com",
  reason: "pricing_or_quote" as const,
  urgency: "high" as const,
  assignedRep: MOCK_REP,
  draftReply: "Thanks for asking about pricing. Let me connect you with our team.",
};

// ── Slack ─────────────────────────────────────────────────────────────────────

describe("sendSlackEscalationNotification", () => {
  afterEach(() => {
    delete process.env["SLACK_WEBHOOK_URL"];
    delete process.env["DASHBOARD_URL"];
  });

  test("skips silently when SLACK_WEBHOOK_URL is not set", async () => {
    const { sendSlackEscalationNotification } = await import("../notifications/slack.js");
    await expect(sendSlackEscalationNotification(BASE_PARAMS)).resolves.toBeUndefined();
  });

  test("POSTs to the Slack webhook URL when configured", async () => {
    process.env["SLACK_WEBHOOK_URL"] = "https://hooks.slack.com/test";
    process.env["DASHBOARD_URL"] = "https://mydashboard.com";

    const spy = spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const { sendSlackEscalationNotification } = await import("../notifications/slack.js");
    await sendSlackEscalationNotification(BASE_PARAMS);

    expect(spy).toHaveBeenCalledTimes(1);
    const [url, options] = spy.mock.calls[0]!;
    expect(url).toBe("https://hooks.slack.com/test");
    expect((options as RequestInit).method).toBe("POST");

    spy.mockRestore();
  });

  test("includes lead email, rep name, and reason in payload", async () => {
    process.env["SLACK_WEBHOOK_URL"] = "https://hooks.slack.com/test";

    const spy = spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const { sendSlackEscalationNotification } = await import("../notifications/slack.js");
    await sendSlackEscalationNotification(BASE_PARAMS);

    const [, options] = spy.mock.calls[0]!;
    const payload = (options as RequestInit).body as string;
    expect(payload).toContain("prospect@acme.com");
    expect(payload).toContain("Sarah Chen");
    expect(payload).toContain("Pricing / Quote");

    spy.mockRestore();
  });

  test("includes draft reply in payload when provided", async () => {
    process.env["SLACK_WEBHOOK_URL"] = "https://hooks.slack.com/test";

    const spy = spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const { sendSlackEscalationNotification } = await import("../notifications/slack.js");
    await sendSlackEscalationNotification(BASE_PARAMS);

    const [, options] = spy.mock.calls[0]!;
    expect((options as RequestInit).body as string).toContain("Draft reply");

    spy.mockRestore();
  });
});

// ── Email ─────────────────────────────────────────────────────────────────────

describe("sendEmailEscalationNotification", () => {
  test("sends to the assigned rep's email address", async () => {
    const emailModule = await import("../integrations/email/client.js");
    const spy = spyOn(emailModule, "sendEmail").mockResolvedValueOnce({ messageId: "mock_id", sentAt: new Date().toISOString() });

    const { sendEmailEscalationNotification } = await import("../notifications/email.js");
    await sendEmailEscalationNotification(BASE_PARAMS);

    expect(spy).toHaveBeenCalledTimes(1);
    const [params] = spy.mock.calls[0]!;
    expect(params.to).toBe("sarah.chen@co.com");

    spy.mockRestore();
  });

  test("includes escalation reason in subject", async () => {
    const emailModule = await import("../integrations/email/client.js");
    const spy = spyOn(emailModule, "sendEmail").mockResolvedValueOnce({ messageId: "mock_id", sentAt: new Date().toISOString() });

    const { sendEmailEscalationNotification } = await import("../notifications/email.js");
    await sendEmailEscalationNotification(BASE_PARAMS);

    const [params] = spy.mock.calls[0]!;
    expect(params.subject).toContain("Pricing / Quote");

    spy.mockRestore();
  });

  test("includes lead email and draft reply in body", async () => {
    const emailModule = await import("../integrations/email/client.js");
    const spy = spyOn(emailModule, "sendEmail").mockResolvedValueOnce({ messageId: "mock_id", sentAt: new Date().toISOString() });

    const { sendEmailEscalationNotification } = await import("../notifications/email.js");
    await sendEmailEscalationNotification(BASE_PARAMS);

    const [params] = spy.mock.calls[0]!;
    expect(params.body).toContain("prospect@acme.com");
    expect(params.body).toContain(BASE_PARAMS.draftReply);

    spy.mockRestore();
  });
});

// ── Orchestrator ──────────────────────────────────────────────────────────────

describe("notifyEscalation", () => {
  test("resolves when no channels are configured", async () => {
    delete process.env["SLACK_WEBHOOK_URL"];
    const { notifyEscalation } = await import("../notifications/index.js");
    await expect(notifyEscalation({ ...BASE_PARAMS, assignedRep: undefined })).resolves.toBeUndefined();
  });

  test("skips email notification when no rep is assigned", async () => {
    const emailModule = await import("../integrations/email/client.js");
    const spy = spyOn(emailModule, "sendEmail").mockResolvedValue({ messageId: "mock_id", sentAt: new Date().toISOString() });

    const { notifyEscalation } = await import("../notifications/index.js");
    await notifyEscalation({ ...BASE_PARAMS, assignedRep: undefined });

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
