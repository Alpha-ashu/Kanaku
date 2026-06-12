import { Queue } from "bullmq";
import Redis from "ioredis";

/**
 * Redis Configuration
 *
 * Supports two connection styles:
 *   - REDIS_URL   → full URL (used by Upstash, Redis Cloud, Railway Redis)
 *                   e.g. rediss://default:<password>@<host>:6380
 *   - REDIS_HOST / REDIS_PORT / REDIS_PASSWORD → explicit fields (local dev)
 *
 * Upstash requires TLS (rediss://) and maxRetriesPerRequest=null for BullMQ.
 */

function createRedisClient(): Redis {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    // URL-based connection (Upstash, Railway Redis, Redis Cloud)
    return new Redis(redisUrl, {
      maxRetriesPerRequest: null,  // Required by BullMQ
      enableReadyCheck: false,
      tls: redisUrl.startsWith("rediss://") ? {} : undefined,
    });
  }

  // Explicit host/port (local dev)
  return new Redis({
    host:                process.env.REDIS_HOST || "localhost",
    port:                parseInt(process.env.REDIS_PORT || "6379"),
    password:            process.env.REDIS_PASSWORD || undefined,
    db:                  parseInt(process.env.REDIS_DB || "0"),
    maxRetriesPerRequest: null,
    enableReadyCheck:    false,
    commandTimeout:      2000,
    retryStrategy:       (times) => Math.min(times * 500, 10_000),
  });
}

export const redisConnection  = createRedisClient();
export const redisSubscriber  = createRedisClient();

redisConnection.on("error", (err) => {
  if (process.env.NODE_ENV === "production") {
    console.error("[Redis] Connection error:", err.message);
  }
});
redisSubscriber.on("error", (err) => {
  if (process.env.NODE_ENV === "production") {
    console.error("[Redis] Subscriber error:", err.message);
  }
});

export function initializeQueues() {
  const emailQueue = new Queue("email-notifications", { connection: redisConnection as any });
  const pushQueue  = new Queue("push-notifications",  { connection: redisConnection as any });
  const syncQueue  = new Queue("sync-operations",     { connection: redisConnection as any });

  const isProd = process.env.NODE_ENV === "production";
  [emailQueue, pushQueue, syncQueue].forEach(q =>
    q.on("error", (err) => {
      if (isProd) console.error(`[Queue:${q.name}] Error:`, err.message);
    })
  );

  console.log("✓ Job queues initialized (email, push, sync)");
  return { emailQueue, pushQueue, syncQueue };
}

export async function testRedisConnection(): Promise<boolean> {
  try {
    const result = await redisConnection.ping();
    if (result === "PONG") {
      console.log("✓ Redis connected successfully");
      return true;
    }
  } catch (error: any) {
    console.error("✗ Redis connection failed:", error.message);
  }
  return false;
}

export async function closeRedisConnections() {
  await Promise.allSettled([redisConnection.quit(), redisSubscriber.quit()]);
  console.log("✓ Redis connections closed");
}

export const getQueues = initializeQueues;

export default {
  redisConnection,
  redisSubscriber,
  initializeQueues,
  getQueues,
  testRedisConnection,
  closeRedisConnections,
};
