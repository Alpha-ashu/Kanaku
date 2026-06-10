#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { Client } = require('pg');

const rootDir = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(rootDir, '.env') });
dotenv.config({ path: path.join(rootDir, '..', '.env'), override: false });

const connectionString =
  process.env.SYNC_DATABASE_URL ||
  process.env.SUPABASE_DIRECT_URL ||
  process.env.SUPABASE_POOLER_URL ||
  process.env.DATABASE_URL;

if (!connectionString) {
  console.error('[ensure-cloud-sync-schema] Missing database URL. Set SYNC_DATABASE_URL, SUPABASE_DIRECT_URL, SUPABASE_POOLER_URL, or DATABASE_URL.');
  process.exit(1);
}

const sqlPath = path.join(__dirname, 'sql', 'ensure-cloud-sync-schema.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const expectedTables = [
  'profiles',
  'accounts',
  'transactions',
  'goals',
  'loans',
  'investments',
  'friends_sync',
  'group_expenses_sync',
];

const client = new Client({
  connectionString,
  ssl: connectionString.includes('supabase.co') || connectionString.includes('neon.tech') || connectionString.includes('pooler.supabase.com') ? { rejectUnauthorized: false } : undefined
});

async function main() {
  await client.connect();

  console.log('[ensure-cloud-sync-schema] Applying KANAKU cloud sync schema...');
  await client.query('BEGIN');

  try {
    await client.query(sql);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }

  const tableResult = await client.query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
      ORDER BY table_name
    `,
    [expectedTables]
  );

  const tables = tableResult.rows.map((row) => row.table_name);
  console.log(`[ensure-cloud-sync-schema] Verified tables: ${tables.join(', ')}`);

  const columnResult = await client.query(
    `
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
      ORDER BY table_name, ordinal_position
    `,
    [expectedTables]
  );

  const requiredColumns = {
    profiles: ['id', 'email', 'full_name', 'first_name', 'last_name', 'phone', 'avatar_url', 'avatar_id', 'monthly_income', 'annual_income', 'date_of_birth', 'job_type', 'country', 'state', 'city', 'visible_features', 'created_at', 'updated_at'],
    accounts: ['id', 'user_id', 'local_id', 'name', 'type', 'provider', 'country', 'balance', 'currency', 'is_active', 'created_at', 'updated_at', 'deleted_at'],
    transactions: ['id', 'user_id', 'local_id', 'type', 'amount', 'account_id', 'category', 'subcategory', 'description', 'merchant', 'date', 'tags', 'attachment', 'transfer_to_account_id', 'transfer_type', 'expense_mode', 'group_expense_id', 'group_name', 'split_type', 'import_source', 'import_metadata', 'original_category', 'imported_at', 'created_at', 'updated_at', 'deleted_at'],
    goals: ['id', 'user_id', 'local_id', 'name', 'description', 'target_amount', 'current_amount', 'target_date', 'category', 'is_group_goal', 'created_at', 'updated_at', 'deleted_at'],
    loans: ['id', 'user_id', 'local_id', 'type', 'name', 'principal_amount', 'outstanding_balance', 'interest_rate', 'total_payable', 'emi_amount', 'due_date', 'loan_date', 'frequency', 'status', 'contact_person', 'friend_id', 'contact_email', 'contact_phone', 'account_id', 'notes', 'created_at', 'updated_at', 'deleted_at'],
    investments: ['id', 'user_id', 'local_id', 'asset_type', 'asset_name', 'quantity', 'buy_price', 'current_price', 'total_invested', 'current_value', 'profit_loss', 'purchase_date', 'last_updated', 'broker', 'description', 'asset_currency', 'base_currency', 'buy_fx_rate', 'last_known_fx_rate', 'total_invested_native', 'current_value_native', 'valuation_version', 'position_status', 'closed_at', 'close_price', 'close_fx_rate', 'gross_sale_value', 'net_sale_value', 'funding_account_id', 'purchase_fees', 'purchase_transaction_id', 'purchase_fee_transaction_id', 'sale_transaction_id', 'sale_fee_transaction_id', 'closing_fees', 'realized_profit_loss', 'settlement_account_id', 'close_notes', 'created_at', 'updated_at', 'deleted_at'],
    friends_sync: ['id', 'user_id', 'local_id', 'name', 'email', 'phone', 'avatar', 'notes', 'created_at', 'updated_at', 'deleted_at'],
    group_expenses_sync: ['id', 'user_id', 'local_id', 'name', 'total_amount', 'paid_by', 'date', 'members', 'items', 'description', 'category', 'subcategory', 'split_type', 'your_share', 'expense_transaction_id', 'created_by', 'created_by_name', 'status', 'notification_status', 'created_at', 'updated_at', 'deleted_at'],
  };

  const columnsByTable = new Map();
  for (const row of columnResult.rows) {
    const columns = columnsByTable.get(row.table_name) || [];
    columns.push(row.column_name);
    columnsByTable.set(row.table_name, columns);
  }

  let hasMissingColumn = false;
  for (const [tableName, columns] of Object.entries(requiredColumns)) {
    const existing = new Set(columnsByTable.get(tableName) || []);
    const missing = columns.filter((column) => !existing.has(column));
    if (missing.length > 0) {
      hasMissingColumn = true;
      console.error(`[ensure-cloud-sync-schema] Missing columns in ${tableName}: ${missing.join(', ')}`);
    }
  }

  if (hasMissingColumn) {
    process.exitCode = 1;
    return;
  }

  console.log('[ensure-cloud-sync-schema] Cloud sync schema is ready.');
}

main()
  .catch((error) => {
    console.error('[ensure-cloud-sync-schema] Failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await client.end();
    } catch {
      // Ignore close failures.
    }
  });
