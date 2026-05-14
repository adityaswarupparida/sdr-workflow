import IORedis from "ioredis";

const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";

// Shared Redis connection — reused by queue and worker to avoid extra connections
export function createRedisConnection(): IORedis {
  const url = new URL(REDIS_URL);
  return new IORedis({
    host: url.hostname,
    port: parseInt(url.port || "6379"),
    password: url.password || undefined,
    maxRetriesPerRequest: null, // required by BullMQ
  });
}
