const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function runMigration() {
  // Read the connection string from the environment — never hardcode DB
  // credentials in source (see copilot-instructions security contract).
  const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!connectionString) {
    console.error('No database URL found. Set DATABASE_URL (or DIRECT_URL) in .env');
    process.exitCode = 1;
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
