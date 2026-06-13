const { Client } = require('pg');

async function testConnection() {
    const url = 'postgresql://postgres.mmwrckfqeqjfqciymemh:KANAKU_2026_@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres';
    const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

    try {
        await client.connect();
        // check migrations
        const res = await client.query('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 10');
        console.log("Migrations applied:");
        res.rows.forEach(r => console.log(r.version));
    } catch (e) {
        console.error("Connection failed:", e.message);
    } finally {
        await client.end();
    }
}

testConnection();
