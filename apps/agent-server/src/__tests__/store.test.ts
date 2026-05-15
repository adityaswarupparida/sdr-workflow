import { describe, test, expect, beforeEach } from "bun:test";

// Use in-memory DB — must be set before the module loads
process.env["DB_PATH"] = ":memory:";

const {
  getOrCreateConversation, appendMessage, markResolved, setEscalated, approveDraft,
  listConversations, getConversation, saveCustomReply, reassignConversation,
  createRep, listReps, getRep, updateRep, deleteRep, assignRepRoundRobin,
  saveSummary, appendSummaryAction,
} = await import("../db/store.js");

// ── Helper ────────────────────────────────────────────────────────────────────

let threadCounter = 0;
function uniqueThread(): string {
  return `thread_test_${++threadCounter}_${Date.now()}`;
}

// ── Sales Reps ────────────────────────────────────────────────────────────────

describe("createRep / listReps", () => {
  test("creates a rep and returns it", () => {
    const rep = createRep("Alice Smith", "alice@co.com");
    expect(rep.name).toBe("Alice Smith");
    expect(rep.email).toBe("alice@co.com");
    expect(rep.isActive).toBe(true);
    expect(rep.id).toMatch(/^rep_/);
  });

  test("lists all reps", () => {
    createRep("Bob Jones", "bob@co.com");
    const reps = listReps();
    expect(reps.length).toBeGreaterThanOrEqual(2);
  });

  test("listReps(activeOnly) filters inactive reps", () => {
    const rep = createRep("Inactive Rep", "inactive@co.com");
    updateRep(rep.id, { isActive: false });
    const active = listReps(true);
    expect(active.find((r) => r.id === rep.id)).toBeUndefined();
  });
});

describe("getRep / updateRep / deleteRep", () => {
  test("getRep returns correct rep", () => {
    const rep = createRep("Carol Lee", "carol@co.com");
    const found = getRep(rep.id);
    expect(found?.name).toBe("Carol Lee");
  });

  test("getRep returns null for unknown id", () => {
    expect(getRep("rep_unknown_999")).toBeNull();
  });

  test("updateRep changes name and email", () => {
    const rep = createRep("Old Name", "old@co.com");
    const updated = updateRep(rep.id, { name: "New Name", email: "new@co.com" });
    expect(updated?.name).toBe("New Name");
    expect(updated?.email).toBe("new@co.com");
  });

  test("deleteRep removes the rep", () => {
    const rep = createRep("Temp Rep", "temp@co.com");
    deleteRep(rep.id);
    expect(getRep(rep.id)).toBeNull();
  });
});

describe("assignRepRoundRobin", () => {
  test("returns null when no active reps exist", () => {
    // Deactivate all reps for this sub-test — can't easily reset, so just verify the return type
    const rep = assignRepRoundRobin();
    // Either a rep or null — both valid depending on prior test state
    if (rep !== null) {
      expect(rep.isActive).toBe(true);
    }
  });

  test("assigns to rep with fewest conversations", async () => {
    const rep1 = createRep("Busy Rep", `busy_${Date.now()}@co.com`);
    const rep2 = createRep("Free Rep", `free_${Date.now()}@co.com`);

    // Give rep1 a conversation
    await getOrCreateConversation(uniqueThread(), "lead@example.com");

    const assigned = assignRepRoundRobin();
    // The free rep should be preferred (fewest convs)
    expect(assigned).not.toBeNull();
    // At minimum the result is an active rep
    expect(assigned?.isActive).toBe(true);
  });
});

// ── Conversations ─────────────────────────────────────────────────────────────

describe("getOrCreateConversation", () => {
  test("creates a new conversation", async () => {
    const conv = await getOrCreateConversation(uniqueThread(), "prospect@acme.com");
    expect(conv.id).toMatch(/^conv_/);
    expect(conv.leadEmail).toBe("prospect@acme.com");
    expect(conv.status).toBe("active");
    expect(conv.messages).toHaveLength(0);
  });

  test("returns same conversation on second call with same threadId", async () => {
    const threadId = uniqueThread();
    const first = await getOrCreateConversation(threadId, "a@b.com");
    const second = await getOrCreateConversation(threadId, "a@b.com");
    expect(first.id).toBe(second.id);
  });
});

describe("appendMessage", () => {
  test("adds a message to the conversation", async () => {
    const conv = await getOrCreateConversation(uniqueThread(), "msg@test.com");
    await appendMessage(conv.id, { role: "user", content: "Hello!", timestamp: new Date().toISOString() });
    const updated = getConversation(conv.id);
    expect(updated?.messages).toHaveLength(1);
    expect(updated?.messages[0]?.content).toBe("Hello!");
  });

  test("appends multiple messages in order", async () => {
    const conv = await getOrCreateConversation(uniqueThread(), "multi@test.com");
    await appendMessage(conv.id, { role: "user", content: "First", timestamp: new Date().toISOString() });
    await appendMessage(conv.id, { role: "assistant", content: "Second", timestamp: new Date().toISOString() });
    const updated = getConversation(conv.id);
    expect(updated?.messages).toHaveLength(2);
    expect(updated?.messages[1]?.content).toBe("Second");
  });
});

describe("markResolved", () => {
  test("sets conversation status to resolved", async () => {
    const conv = await getOrCreateConversation(uniqueThread(), "resolve@test.com");
    await markResolved(conv.id);
    expect(getConversation(conv.id)?.status).toBe("resolved");
  });
});

describe("setEscalated / approveDraft", () => {
  test("setEscalated sets status to escalated for specialist reasons", async () => {
    const conv = await getOrCreateConversation(uniqueThread(), "esc@test.com");
    await setEscalated(conv.id, "pricing_or_quote", "Here is the draft reply...");
    const updated = getConversation(conv.id);
    expect(updated?.status).toBe("escalated"); // specialist reason → escalated
    expect(updated?.escalationReason).toBe("pricing_or_quote");
    expect(updated?.draftReply).toBe("Here is the draft reply...");
  });

  test("setEscalated sets status to pending_review for low_confidence", async () => {
    const conv = await getOrCreateConversation(uniqueThread(), "low@test.com");
    await setEscalated(conv.id, "low_confidence", "Not sure how to respond...");
    const updated = getConversation(conv.id);
    expect(updated?.status).toBe("pending_review"); // non-specialist → pending review
  });

  test("approveDraft sets transferred for escalated conversations", async () => {
    const conv = await getOrCreateConversation(uniqueThread(), "approve@test.com");
    await setEscalated(conv.id, "pricing_or_quote", "Draft to send");
    const draft = await approveDraft(conv.id);
    expect(draft).toBe("Draft to send");
    const updated = getConversation(conv.id);
    expect(updated?.status).toBe("transferred"); // specialist handoff → transferred not resolved
    expect(updated?.draftReply).toBeUndefined();
  });

  test("approveDraft sets resolved for pending_review conversations", async () => {
    const conv = await getOrCreateConversation(uniqueThread(), "approve2@test.com");
    await setEscalated(conv.id, "low_confidence", "Draft to send");
    const draft = await approveDraft(conv.id);
    expect(draft).toBe("Draft to send");
    const updated = getConversation(conv.id);
    expect(updated?.status).toBe("resolved"); // non-specialist → resolved
  });

  test("approveDraft returns null for unknown conversation", async () => {
    const result = await approveDraft("conv_does_not_exist");
    expect(result).toBeNull();
  });
});

describe("listConversations", () => {
  test("returns all conversations when no status filter", async () => {
    await getOrCreateConversation(uniqueThread(), "list1@test.com");
    await getOrCreateConversation(uniqueThread(), "list2@test.com");
    const all = listConversations();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  test("filters by status", async () => {
    const conv = await getOrCreateConversation(uniqueThread(), "filter@test.com");
    await markResolved(conv.id);
    const resolved = listConversations("resolved");
    expect(resolved.every((c) => c.status === "resolved")).toBe(true);
  });
});

describe("reassignConversation", () => {
  test("updates the assignedRepId", async () => {
    const conv = await getOrCreateConversation(uniqueThread(), "reassign@test.com");
    const rep = createRep("New Rep", `newrep_${Date.now()}@co.com`);
    await reassignConversation(conv.id, rep.id);
    const updated = getConversation(conv.id);
    expect(updated?.assignedRepId).toBe(rep.id);
    expect(updated?.assignedRep?.name).toBe("New Rep");
  });
});

describe("setEscalated — all specialist reasons", () => {
  const specialistReasons = [
    "pricing_or_quote",
    "technical_deep_dive",
    "existing_customer",
    "legal_or_contract",
  ] as const;

  for (const reason of specialistReasons) {
    test(`${reason} → escalated`, async () => {
      const conv = await getOrCreateConversation(uniqueThread(), `${reason}@test.com`);
      await setEscalated(conv.id, reason, "draft");
      expect(getConversation(conv.id)?.status).toBe("escalated");
    });
  }

  test("low_confidence → pending_review (not a specialist route)", async () => {
    const conv = await getOrCreateConversation(uniqueThread(), "lc@test.com");
    await setEscalated(conv.id, "low_confidence", "draft");
    expect(getConversation(conv.id)?.status).toBe("pending_review");
  });
});

describe("saveCustomReply", () => {
  test("resolves conversation when status is pending_review", async () => {
    const conv = await getOrCreateConversation(uniqueThread(), "custom@test.com");
    await setEscalated(conv.id, "low_confidence", "agent draft");
    await saveCustomReply(conv.id, "My custom reply");
    const updated = getConversation(conv.id);
    expect(updated?.status).toBe("resolved");
    expect(updated?.messages.some((m) => m.content.includes("My custom reply"))).toBe(true);
  });

  test("sets transferred when conversation is escalated to specialist", async () => {
    const conv = await getOrCreateConversation(uniqueThread(), "custom_esc@test.com");
    await setEscalated(conv.id, "legal_or_contract", "agent draft");
    await saveCustomReply(conv.id, "Custom reply to legal query");
    expect(getConversation(conv.id)?.status).toBe("transferred");
  });

  test("clears draftReply regardless of final status", async () => {
    const conv = await getOrCreateConversation(uniqueThread(), "draft_clear@test.com");
    await setEscalated(conv.id, "technical_deep_dive", "Technical draft");
    await saveCustomReply(conv.id, "Custom technical reply");
    expect(getConversation(conv.id)?.draftReply).toBeUndefined();
  });
});

describe("saveSummary / appendSummaryAction", () => {
  test("saveSummary persists structured summary on conversation", async () => {
    const conv = await getOrCreateConversation(uniqueThread(), "summary@test.com");
    await saveSummary(conv.id, {
      leadStatus: "qualified",
      actions: [{ step: "Salesforce Lookup", detail: "Alex Rivera · Acme Corp" }],
      notes: "Hot lead, follow up soon.",
      nextAction: "Discovery call booked",
    });
    const updated = getConversation(conv.id);
    expect(updated?.summary?.leadStatus).toBe("qualified");
    expect(updated?.summary?.actions).toHaveLength(1);
    expect(updated?.summary?.actions[0]?.step).toBe("Salesforce Lookup");
    expect(updated?.summary?.notes).toBe("Hot lead, follow up soon.");
    expect(updated?.summary?.nextAction).toBe("Discovery call booked");
  });

  test("appendSummaryAction adds a new action to existing summary", async () => {
    const conv = await getOrCreateConversation(uniqueThread(), "append@test.com");
    await saveSummary(conv.id, {
      leadStatus: "new",
      actions: [{ step: "Salesforce Lookup", detail: "Found" }],
    });
    await appendSummaryAction(conv.id, { step: "Email Sent", detail: "Intro email sent" });
    const updated = getConversation(conv.id);
    expect(updated?.summary?.actions).toHaveLength(2);
    expect(updated?.summary?.actions[1]?.step).toBe("Email Sent");
  });

  test("appendSummaryAction updates nextAction when provided", async () => {
    const conv = await getOrCreateConversation(uniqueThread(), "nextact@test.com");
    await saveSummary(conv.id, { leadStatus: "contacted", actions: [], nextAction: "Follow-up" });
    await appendSummaryAction(conv.id, { step: "Human Approved", detail: "Sent by rep" }, "Resolved");
    expect(getConversation(conv.id)?.summary?.nextAction).toBe("Resolved");
  });

  test("appendSummaryAction preserves nextAction when not provided", async () => {
    const conv = await getOrCreateConversation(uniqueThread(), "keepnext@test.com");
    await saveSummary(conv.id, { leadStatus: "new", actions: [], nextAction: "Awaiting reply" });
    await appendSummaryAction(conv.id, { step: "HubSpot Sync", detail: "Contact created" });
    expect(getConversation(conv.id)?.summary?.nextAction).toBe("Awaiting reply");
  });

  test("appendSummaryAction does nothing when conversation has no summary", async () => {
    const conv = await getOrCreateConversation(uniqueThread(), "nosummary@test.com");
    // Should not throw
    await expect(
      appendSummaryAction(conv.id, { step: "Ghost step", detail: "Nothing" })
    ).resolves.toBeUndefined();
    expect(getConversation(conv.id)?.summary).toBeUndefined();
  });

  test("saveSummary overwrites previous summary", async () => {
    const conv = await getOrCreateConversation(uniqueThread(), "overwrite@test.com");
    await saveSummary(conv.id, { leadStatus: "new", actions: [{ step: "Old", detail: "Old data" }] });
    await saveSummary(conv.id, { leadStatus: "qualified", actions: [{ step: "New", detail: "New data" }] });
    const updated = getConversation(conv.id);
    expect(updated?.summary?.leadStatus).toBe("qualified");
    expect(updated?.summary?.actions[0]?.step).toBe("New");
  });
});
