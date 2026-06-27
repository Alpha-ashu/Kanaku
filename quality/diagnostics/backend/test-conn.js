const { Client } = require('pg');

async function testConnection() {
    const url = process.env.DATABASE_URL;
    if (!url) {
        console.error('DATABASE_URL is not set. Export it before running, e.g.:\n  DATABASE_URL="postgresql://..." node scripts/test-conn.js');
        process.exit(1);
    }
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
