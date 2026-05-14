import { describe, test, expect, spyOn } from "bun:test";

process.env["DB_PATH"] = ":memory:";

const { getOrCreateConversation, markResolved, setEscalated, createRep } = await import("../db/store.js");
const { processFollowup } = await import("../queue/followup.worker.js");

const BASE_JOB = {
  conversationId: "conv_test",
  leadEmail: "prospect@acme.com",
  leadId: "sf_001",
  reason: "No reply after initial outreach",
  scheduledFor: new Date().toISOString(),
};

describe("processFollowup", () => {
  test("skips when conversation does not exist", async () => {
    const result = await processFollowup({ ...BASE_JOB, conversationId: "conv_nonexistent" });
    expect(result.skipped).toContain("not found");
  });

  test("skips when conversation is already resolved", async () => {
    const conv = await getOrCreateConversation("thread_resolved_fu", "prospect@acme.com");
    await markResolved(conv.id);
    const result = await processFollowup({ ...BASE_JOB, conversationId: conv.id });
    expect(result.skipped).toContain("resolved");
  });

  test("skips when conversation is pending human review", async () => {
    const conv = await getOrCreateConversation("thread_pending_fu", "prospect@acme.com");
    await setEscalated(conv.id, "pricing_or_quote", "Draft");
    const result = await processFollowup({ ...BASE_JOB, conversationId: conv.id });
    expect(result.skipped).toContain("pending human review");
  });

  test("calls runSdrAgent when conversation is active", async () => {
    const conv = await getOrCreateConversation("thread_active_fu", "prospect@acme.com");

    const agentModule = await import("../agent/sdr-agent.js");
    const spy = spyOn(agentModule, "runSdrAgent").mockResolvedValueOnce({
      conversationId: conv.id,
      escalated: false,
      emailSent: true,
      hubspotLogged: true,
    });

    const result = await processFollowup({ ...BASE_JOB, conversationId: conv.id });

    expect(spy).toHaveBeenCalledTimes(1);
    const [inbound] = spy.mock.calls[0]!;
    expect(inbound.from).toBe("prospect@acme.com");
    expect(inbound.threadId).toBe(conv.threadId);
    expect(inbound.body).toContain(BASE_JOB.reason);
    expect(result.sent).toBe(true);

    spy.mockRestore();
  });

  test("passes the follow-up reason as context to the agent", async () => {
    const conv = await getOrCreateConversation("thread_reason_fu", "lead@globex.io");

    const agentModule = await import("../agent/sdr-agent.js");
    const spy = spyOn(agentModule, "runSdrAgent").mockResolvedValueOnce({
      conversationId: conv.id,
      escalated: false,
      emailSent: true,
      hubspotLogged: false,
    });

    await processFollowup({ ...BASE_JOB, conversationId: conv.id, leadEmail: "lead@globex.io", reason: "Sent demo, no response" });

    const [inbound] = spy.mock.calls[0]!;
    expect(inbound.body).toContain("Sent demo, no response");

    spy.mockRestore();
  });
});
