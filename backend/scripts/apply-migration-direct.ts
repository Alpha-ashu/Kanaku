import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('No DATABASE_URL found');
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();
  console.log('Connected to PostgreSQL');

  try {
    console.log('1. Adding Notification.dedupKey...');
    await client.query(`
      ALTER TABLE "public"."Notification"
      ADD COLUMN IF NOT EXISTS "dedupKey" TEXT;
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "Notification_dedupKey_key"
      ON "public"."Notification" ("dedupKey");
    `);
    console.log('Notification.dedupKey created with unique index');

    console.log('2. Adding recurring_executions.transactionId...');
    await client.query(`
      ALTER TABLE "public"."recurring_executions"
      ADD COLUMN IF NOT EXISTS "transactionId" TEXT;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS "recurring_executions_transactionId_idx"
      ON "public"."recurring_executions" ("transactionId");
    `);
    console.log('recurring_executions.transactionId created with index');

    console.log('3. Verifying columns...');
    const res1 = await client.query(`
      SELECT column_name, data_type FROM information_schema.columns 
      WHERE table_name = 'Notification' AND column_name = 'dedupKey';
    `);
    const res2 = await client.query(`
      SELECT column_name, data_type FROM information_schema.columns 
      WHERE table_name = 'recurring_executions' AND column_name = 'transactionId';
    `);

    console.log('Notification.dedupKey verification:', res1.rows);
    console.log('recurring_executions.transactionId verification:', res2.rows);

    if (res1.rows.length > 0 && res2.rows.length > 0) {
      console.log('SUCCESS: All database migration columns and indexes verified!');
    } else {
      console.error('VERIFICATION FAILED: Missing columns');
    }
  } catch (err: any) {
    console.error('Migration error:', err.message);
  } finally {
    await client.end();
  }
}

run();
