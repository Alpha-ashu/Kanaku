const { Client } = require('pg');

async function checkSchema() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set. Export it before running, e.g.:\n  DATABASE_URL="postgresql://..." node scripts/check-db.js');
    process.exit(1);
  }
  const client = new Client({ connectionString });

  try {
    await client.connect();

    // Check if the latest migration table exists or check recent tables
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log("--- Public Tables ---");
    res.rows.forEach(r => console.log(r.table_name));

    // Check specific columns added in latest migrations
    // 006 added offline_id, metadata etc to transactions
    const colRes = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'transactions';
    `);
    console.log("\n--- Transaction Columns ---");
    const cols = colRes.rows.map(r => r.column_name);
    console.log(cols.join(', '));
    console.log("Has expense_mode (from 006)?:", cols.includes('expense_mode'));

    // 007 added user_pins table
    const pinRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'user_pins';
    `);
    console.log("\n--- Does user_pins exist (from 007)? ---");
    console.log(pinRes.rows.length > 0 ? "Yes" : "No");

    // 009 accounts_country_provider 
    const acpRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'accounts_country_provider';
    `);
    console.log("\n--- Does accounts_country_provider exist (from 009)? ---");
    console.log(acpRes.rows.length > 0 ? "Yes" : "No");

    // Check supabase migrations
    const migRes = await client.query(`
      SELECT version 
      FROM supabase_migrations.schema_migrations
      ORDER BY version DESC LIMIT 5;
    `);
    console.log("\n--- Latest applied migrations ---");
    migRes.rows.forEach(r => console.log(r.version));

  } catch (e) {
    console.error("Error:", e.message);
  } finally {
    await client.end();
  }
}

checkSchema();