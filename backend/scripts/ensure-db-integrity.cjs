#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { Client } = require('pg');

const rootDir = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(rootDir, '.env') });
dotenv.config({ path: path.join(rootDir, '..', '.env'), override: false });

const connectionString =
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DIRECT_URL ||
  process.env.SUPABASE_POOLER_URL ||
  process.env.SYNC_DATABASE_URL;

if (!connectionString) {
  console.error('[ensure-db-integrity] Missing database URL. Set DATABASE_URL, SUPABASE_DIRECT_URL, SUPABASE_POOLER_URL, or SYNC_DATABASE_URL.');
  process.exit(1);
}

const sqlPath = path.join(__dirname, 'sql', 'ensure-db-integrity.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');
const client = new Client({
  connectionString,
  ssl: connectionString.includes('supabase.co') || connectionString.includes('neon.tech') || connectionString.includes('pooler.supabase.com') ? { rejectUnauthorized: false } : undefined
});

async function main() {
  await client.connect();
  console.log('[ensure-db-integrity] Applying KANKU DB integrity schema...');
  await client.query('BEGIN');

  try {
    await client.query(sql);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }

  const indexes = await client.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = ANY($1::text[])
    ORDER BY indexname
  `, [[
    'idx_accounts_user_id',
    'idx_transactions_user_id',
    'idx_transactions_date',
    'idx_transactions_account_id',
    'idx_transactions_category',
    'idx_transactions_user_id_date',
    'idx_goals_user_id',
    'idx_loans_user_id',
    'idx_investments_user_id',
    'idx_notifications_user_id_is_read',
  ]]);

  console.log(`[ensure-db-integrity] Verified indexes: ${indexes.rows.map((row) => row.indexname).join(', ')}`);
  console.log('[ensure-db-integrity] DB integrity schema is ready.');
}

main()
  .catch((error) => {
    console.error('[ensure-db-integrity] Failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await client.end();
    } catch {
      // Ignore close failures.
    }
  });
