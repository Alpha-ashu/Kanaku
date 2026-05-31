import { Queue, Worker, QueueScheduler } from "bullmq";
import Redis from "ioredis";

/**
 * Redis Configuration for Bull Job Queues
 * Supports async email and push notification delivery
 */

const redisConfig = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || "0"),
  maxRetriesPerRequest: null, // Null for unlimited retries (recommended for Bull)
};

/**
 * Create Redis connection instances
 */
export const redisConnection = new Redis(redisConfig);
export const redisSubscriber = new Redis(redisConfig);

/**
 * Initialize job queues
 */
export function initializeQueues() {
  // Create queues
  const emailQueue = new Queue("email-notifications", {
    connection: redisConnection,
  });

  const pushQueue = new Queue("push-notifications", {
    connection: redisConnection,
  });

  const syncQueue = new Queue("sync-operations", {
    connection: redisConnection,
  });

  // Add queue schedulers (runs in background, manages repeating jobs)
  const emailScheduler = new QueueScheduler("email-notifications", {
    connection: redisConnection,
  });

  const pushScheduler = new QueueScheduler("push-notifications", {
    connection: redisConnection,
  });

  const syncScheduler = new QueueScheduler("sync-operations", {
    connection: redisConnection,
  });

  console.log("✓ Job queues initialized (email, push, sync)");

  return {
    emailQueue,
    pushQueue,
    syncQueue,
    schedulers: [emailScheduler, pushScheduler, syncScheduler],
  };
}

/**
 * Test Redis connection
 */
export async function testRedisConnection(): Promise<boolean> {
  try {
    const result = await redisConnection.ping();
    if (result === "PONG") {
      console.log("✓ Redis connected successfully");
      return true;
    }
  } catch (error) {
    console.error("✗ Redis connection failed:", error);
    return false;
  }
  return false;
}

/**
 * Clean up Redis connections (call on app shutdown)
 */
export async function closeRedisConnections() {
  try {
    await redisConnection.quit();
    await redisSubscriber.quit();
    console.log("✓ Redis connections closed");
  } catch (error) {
    console.error("Error closing Redis connections:", error);
  }
}

export default {
  redisConnection,
  redisSubscriber,
  initializeQueues,
  testRedisConnection,
  closeRedisConnections,
};
