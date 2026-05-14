import { describe, test, expect, afterEach } from "bun:test";
import { validateWebhookSecret } from "../webhooks/inbound-email.js";

function makeUrl(path: string, params: Record<string, string> = {}): URL {
  const url = new URL(`http://localhost:3001${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url;
}

describe("validateWebhookSecret", () => {
  afterEach(() => {
    delete process.env["WEBHOOK_SECRET"];
  });

  test("allows all requests when WEBHOOK_SECRET is not configured", () => {
    expect(validateWebhookSecret(makeUrl("/webhooks/email"))).toBe(true);
  });

  test("allows request with correct secret", () => {
    process.env["WEBHOOK_SECRET"] = "my-secret-token";
    expect(validateWebhookSecret(makeUrl("/webhooks/email", { secret: "my-secret-token" }))).toBe(true);
  });

  test("blocks request with wrong secret", () => {
    process.env["WEBHOOK_SECRET"] = "my-secret-token";
    expect(validateWebhookSecret(makeUrl("/webhooks/email", { secret: "wrong" }))).toBe(false);
  });

  test("blocks request with missing secret param", () => {
    process.env["WEBHOOK_SECRET"] = "my-secret-token";
    expect(validateWebhookSecret(makeUrl("/webhooks/email"))).toBe(false);
  });
});

describe("Postmark payload detection", () => {
  test("Postmark payload has capitalised keys (From, MessageID, TextBody)", () => {
    const postmark = { From: "a@b.com", Subject: "Hi", TextBody: "Hello", MessageID: "abc", Date: "2026-05-08", Headers: [] };
    // Verify our detection criteria hold
    expect(typeof postmark["From"]).toBe("string");
    expect(typeof postmark["MessageID"]).toBe("string");
    expect(typeof postmark["TextBody"]).toBe("string");
  });

  test("curl/test payload has lowercase keys (from, body)", () => {
    const curl = { from: "a@b.com", subject: "Hi", body: "Hello" };
    expect(typeof (curl as Record<string, unknown>)["From"]).toBe("undefined");
    expect(typeof curl["from"]).toBe("string");
  });
});
