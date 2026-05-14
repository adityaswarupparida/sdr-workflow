import { Queue } from "bullmq";
import { createRedisConnection } from "./connection.js";

export const FOLLOWUP_QUEUE = process.env["FOLLOWUP_QUEUE_NAME"] ?? "sdr-followups";

export interface FollowupJobData {
  conversationId: string;
  leadEmail: string;
  leadId: string;
  reason: string;
  scheduledFor: string; // ISO string — when this follow-up should fire
}

let queue: Queue<FollowupJobData> | null = null;

function getQueue(): Queue<FollowupJobData> {
  if (!queue) {
    queue = new Queue<FollowupJobData>(FOLLOWUP_QUEUE, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: 100, // keep last 100 completed jobs for audit
        removeOnFail: 50,
      },
    });
  }
  return queue;
}

export async function scheduleFollowup(data: FollowupJobData, daysFromNow: number): Promise<string> {
  if (!process.env["REDIS_URL"]) {
    console.warn(`[Queue] REDIS_URL not set — follow-up for ${data.leadEmail} in ${daysFromNow} day(s) not persisted`);
    return `noop_${Date.now()}`;
  }

  const delay = daysFromNow * 24 * 60 * 60 * 1000;
  const jobId = `followup_${data.conversationId}_${Date.now()}`;

  const job = await getQueue().add("send-followup", data, { jobId, delay });
  console.log(`[Queue] Follow-up scheduled for ${data.leadEmail} in ${daysFromNow} day(s) — job: ${job.id}`);
  return job.id ?? jobId;
}

export async function closeQueue(): Promise<void> {
  await queue?.close();
  queue = null;
}
