import { Worker, type Job } from "bullmq";
import { createRedisConnection } from "./connection.js";
import { FOLLOWUP_QUEUE, type FollowupJobData } from "./followup.queue.js";
import { getConversation } from "../db/store.js";
import { runSdrAgent } from "../agent/sdr-agent.js";

// Extracted so it can be unit-tested without a live Redis connection
export async function processFollowup(data: FollowupJobData): Promise<{ skipped?: string; sent?: boolean }> {
  const conversation = getConversation(data.conversationId);

  // Don't follow up if the lead already replied or human is reviewing
  if (!conversation) {
    return { skipped: "conversation not found" };
  }
  if (conversation.status === "resolved") {
    return { skipped: "already resolved — lead likely replied" };
  }
  if (conversation.status === "pending_review") {
    return { skipped: "pending human review — not following up automatically" };
  }

  console.log(`[Worker] Firing follow-up for ${data.leadEmail} — reason: ${data.reason}`);

  // Re-run the agent with a follow-up trigger as a new inbound message
  const outcome = await runSdrAgent({
    from: data.leadEmail,
    subject: `Re: Following up`,
    body: `[SYSTEM: This is an automated follow-up trigger. The agent should send a brief, friendly follow-up email to the prospect. Reason for follow-up: ${data.reason}. Do not mention this is automated — write naturally as the rep.]`,
    threadId: conversation.threadId,
    messageId: `followup_${Date.now()}`,
    receivedAt: new Date().toISOString(),
  });

  return { sent: outcome.emailSent };
}

export function startFollowupWorker(): Worker<FollowupJobData> {
  const worker = new Worker<FollowupJobData>(
    FOLLOWUP_QUEUE,
    async (job: Job<FollowupJobData>) => {
      return processFollowup(job.data);
    },
    {
      connection: createRedisConnection(),
      concurrency: 3,
    },
  );

  worker.on("completed", (job, result) => {
    if ("skipped" in result) {
      console.log(`[Worker] Follow-up skipped (${result.skipped}) — job: ${job.id}`);
    } else {
      console.log(`[Worker] Follow-up sent — job: ${job.id}`);
    }
  });

  worker.on("failed", (job, err) => {
    console.error(`[Worker] Follow-up failed — job: ${job?.id}`, err.message);
  });

  console.log(`[Worker] Follow-up worker started (concurrency: 3)`);
  return worker;
}
