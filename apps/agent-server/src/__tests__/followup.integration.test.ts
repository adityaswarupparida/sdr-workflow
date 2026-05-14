import { describe, test, expect, beforeAll, beforeEach, afterEach, afterAll, spyOn } from "bun:test";
import type { Worker } from "bullmq";

const RUN = Boolean(process.env["REDIS_URL"]);

// Isolate from any other worker (e.g. a local `bun dev` server) sharing this Redis.
// Must be set before the queue/worker modules are imported, since FOLLOWUP_QUEUE
// is read at module-load time.
process.env["FOLLOWUP_QUEUE_NAME"] = "sdr-followups-test";
process.env["DB_PATH"] = ":memory:";

const { startFollowupWorker } = await import("../queue/followup.worker.js");
const { getOrCreateConversation, markResolved } = await import("../db/store.js");
const { scheduleFollowup, closeQueue, FOLLOWUP_QUEUE } = await import("../queue/followup.queue.js");
const { Queue } = await import("bullmq");
const { createRedisConnection } = await import("../queue/connection.js");

function waitForCompleted<T = unknown>(worker: Worker): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Worker did not fire within 5s")), 5000);
    worker.on("completed", (_job, returnValue) => { clearTimeout(timeout); resolve(returnValue as T); });
    worker.on("failed", (_job, err) => { clearTimeout(timeout); reject(err); });
  });
}

function scheduleNow(conv: { id: string; leadEmail: string }, reason: string): Promise<string> {
  return scheduleFollowup(
    { conversationId: conv.id, leadEmail: conv.leadEmail, leadId: "lead", reason, scheduledFor: new Date().toISOString() },
    1000 / 86400000,
  );
}

describe("follow-up scheduler (integration)", () => {
  let worker: Worker;

  beforeAll(async () => {
    if (!RUN) return;
    // Clear any stale jobs left over from a prior crashed run.
    const q = new Queue(FOLLOWUP_QUEUE, { connection: createRedisConnection() });
    await q.obliterate({ force: true });
    await q.close();
  });

  beforeEach(async () => {
    if (!RUN) return;
    worker = startFollowupWorker();
    await worker.waitUntilReady();
  });

  afterEach(async () => {
    if (!RUN) return;
    await worker.close();
  });

  afterAll(async () => {
    if (!RUN) return;
    await closeQueue();
  });

  test.skipIf(!RUN)("skipped when conversation is already resolved", async () => {
    const conv = await getOrCreateConversation("thread_integration_resolved", "integration@test.com");
    await markResolved(conv.id);

    const completed = waitForCompleted<{ skipped?: string }>(worker);
    await scheduleNow(conv, "Integration test");

    expect((await completed).skipped).toBe("already resolved — lead likely replied");
  }, 10000);

  test.skipIf(!RUN)("fires the agent when conversation is active", async () => {
    const conv = await getOrCreateConversation("thread_integration_active", "active@test.com");

    // spyOn updates the ESM live binding, so processFollowup sees the stub when the worker fires.
    const agentModule = await import("../agent/sdr-agent.js");
    const agentSpy = spyOn(agentModule, "runSdrAgent").mockResolvedValueOnce({
      conversationId: conv.id, escalated: false, emailSent: false, hubspotLogged: false,
    });

    const completed = waitForCompleted(worker);
    await scheduleNow(conv, "No reply after demo");
    await completed;

    expect(agentSpy).toHaveBeenCalledTimes(1);
    const [inbound] = agentSpy.mock.calls[0]!;
    expect(inbound.from).toBe("active@test.com");
    expect(inbound.threadId).toBe(conv.threadId);
    expect(inbound.body).toContain("No reply after demo");

    agentSpy.mockRestore();
  }, 10000);
});
