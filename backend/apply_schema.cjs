const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function runMigration() {
  const connectionString = 'postgresql://postgres.mmwrckfqeqjfqciymemh:Alpha_Ashu%401@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true';
  if (!connectionString) {
    console.error('No database URL found in .env');
    return;
  }

  const client = new Client({
    connectionString,
  });

  try {
    await client.connect();
    console.log('Connected to Supabase database.');

    const sqlPath = path.resolve(__dirname, '../platform/database/supabase_schema.sql');
    const sqlQuery = fs.readFileSync(sqlPath, 'utf8');

    console.log('Executing SQL schema...');
    await client.query(sqlQuery);
    console.log('SQL Schema generated and applied successfully!');
  } catch (error) {
    console.error('Error applying schema:', error);
  } finally {
    await client.end();
  }
}

runMigration();
