const { Client } = require('pg');

async function run() {
  const client = new Client({
    host: 'localhost',
    port: 5434,
    user: 'postgres',
    password: 'password', 
    database: 'postgres',
    connectionTimeoutMillis: 2000,
  });
  try {
    await client.connect();
    console.log('Connected to localhost:5434');
    const dbRes = await client.query('SELECT datname FROM pg_database');
    console.log('Databases:', dbRes.rows.map(r => r.datname));
    
    // Choose database
    const dbName = dbRes.rows.find(r => r.datname.toLowerCase().includes('expense_tracker_test'))?.datname || 'postgres';
    console.log('Querying database:', dbName);
    
    await client.end();
    
    const dbClient = new Client({
      host: 'localhost',
      port: 5434,
      user: 'postgres',
      password: 'password',
      database: dbName,
      connectionTimeoutMillis: 2000,
    });
    await dbClient.connect();
    
    // Check tables
    const tableRes = await dbClient.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema='public'
    `);
    console.log('Tables:', tableRes.rows.map(r => r.table_name));
    
    // Check users
    if (tableRes.rows.some(r => r.table_name === 'User')) {
      const usersRes = await dbClient.query('SELECT id, email, role, password FROM "User"');
      console.log('Users in User table:');
      for (const row of usersRes.rows) {
        console.log(`- ID: ${row.id}, Email: ${row.email}, Role: ${row.role}, PasswordHash: ${row.password ? row.password.substring(0, 20) + '...' : 'null'}`);
      }
    }
    
    await dbClient.end();
  } catch (err) {
    console.error('Error connecting or querying:', err.message);
  }
}

run();
