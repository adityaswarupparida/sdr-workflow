import { describe, test, expect } from "bun:test";
import { parseInboundEmail, parsePostmarkInbound } from "../integrations/email/client.js";

describe("parseInboundEmail (curl/test format)", () => {
  test("uses provided threadId and messageId", () => {
    const result = parseInboundEmail({ from: "a@b.com", subject: "Hi", body: "Hello", threadId: "t1", messageId: "m1" });
    expect(result.threadId).toBe("t1");
    expect(result.messageId).toBe("m1");
  });

  test("generates threadId when not provided", () => {
    const result = parseInboundEmail({ from: "a@b.com", subject: "Hi", body: "Hello" });
    expect(result.threadId).toMatch(/^thread_\d+$/);
  });

  test("maps fields correctly", () => {
    const result = parseInboundEmail({ from: "prospect@acme.com", subject: "Demo request", body: "We'd like a demo." });
    expect(result.from).toBe("prospect@acme.com");
    expect(result.subject).toBe("Demo request");
    expect(result.body).toBe("We'd like a demo.");
  });
});

describe("parsePostmarkInbound", () => {
  const base = {
    From: "alex@acme.com",
    Subject: "Interested in your product",
    TextBody: "Tell me more.",
    MessageID: "msg-abc-123",
    Date: "2026-05-08T10:00:00Z",
    Headers: [] as Array<{ Name: string; Value: string }>,
  };

  test("maps Postmark fields to internal format", () => {
    const result = parsePostmarkInbound(base);
    expect(result.from).toBe("alex@acme.com");
    expect(result.subject).toBe("Interested in your product");
    expect(result.body).toBe("Tell me more.");
    expect(result.messageId).toBe("msg-abc-123");
  });

  test("uses MessageID as threadId when no In-Reply-To header", () => {
    const result = parsePostmarkInbound(base);
    expect(result.threadId).toBe("msg-abc-123");
  });

  test("uses In-Reply-To header as threadId for thread continuity", () => {
    const result = parsePostmarkInbound({
      ...base,
      Headers: [{ Name: "In-Reply-To", Value: "<original-msg-id@acme.com>" }],
    });
    expect(result.threadId).toBe("<original-msg-id@acme.com>");
  });

  test("falls back to References header when no In-Reply-To", () => {
    const result = parsePostmarkInbound({
      ...base,
      Headers: [{ Name: "References", Value: "<ref-id@acme.com> <older-ref@acme.com>" }],
    });
    expect(result.threadId).toBe("<ref-id@acme.com>");
  });

  test("parses date correctly", () => {
    const result = parsePostmarkInbound(base);
    expect(new Date(result.receivedAt).toISOString()).toBe("2026-05-08T10:00:00.000Z");
  });
});
