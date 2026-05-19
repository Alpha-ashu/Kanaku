const { Client } = require('pg');

async function test() {
  const urls = [
    'postgresql://postgres@127.0.0.1:5434/postgres',
    'postgresql://postgres@localhost:5434/postgres',
    'postgresql://postgres:password@localhost:5434/expense_tracker_test',
    'postgresql://postgres:password@127.0.0.1:5434/expense_tracker_test'
  ];

  for (const url of urls) {
    console.log('Testing URL:', url);
    const client = new Client({ connectionString: url });
    try {
      await client.connect();
      console.log('  SUCCESS!');
      const res = await client.query('SELECT current_database(), current_user, version()');
      console.log('  Details:', res.rows[0]);
      await client.end();
    } catch (err) {
      console.log('  FAILED:', err.message);
    }
  }
}

test();
