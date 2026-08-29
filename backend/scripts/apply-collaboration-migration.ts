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
    console.log('1. Updating CollaborationParticipant table structure...');
    // Make email column nullable if not already
    await client.query(`
      ALTER TABLE "public"."CollaborationParticipant"
      ALTER COLUMN "email" DROP NOT NULL;
    `);

    // Add phone, friendId, metadata columns if not present
    await client.query(`
      ALTER TABLE "public"."CollaborationParticipant"
      ADD COLUMN IF NOT EXISTS "phone" TEXT,
      ADD COLUMN IF NOT EXISTS "friendId" TEXT,
      ADD COLUMN IF NOT EXISTS "metadata" JSONB;
    `);

    // Drop old strict unique constraint
    await client.query(`
      ALTER TABLE "public"."CollaborationParticipant"
      DROP CONSTRAINT IF EXISTS "CollaborationParticipant_moduleType_moduleId_email_key";
    `);

    // Create non-unique indices for query optimization
    await client.query(`
      CREATE INDEX IF NOT EXISTS "CollaborationParticipant_phone_idx" ON "public"."CollaborationParticipant" ("phone");
      CREATE INDEX IF NOT EXISTS "CollaborationParticipant_friendId_idx" ON "public"."CollaborationParticipant" ("friendId");
      CREATE INDEX IF NOT EXISTS "CollaborationParticipant_status_idx" ON "public"."CollaborationParticipant" ("status");
    `);

    console.log('2. Verifying columns...');
    const res = await client.query(`
      SELECT column_name, is_nullable, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'CollaborationParticipant';
    `);

    console.log('CollaborationParticipant columns:', res.rows.map(r => `${r.column_name} (${r.data_type}, nullable=${r.is_nullable})`));
    console.log('SUCCESS: CollaborationParticipant migration applied successfully!');
  } catch (err: any) {
    console.error('Migration error:', err.message);
  } finally {
    await client.end();
  }
}

run();
