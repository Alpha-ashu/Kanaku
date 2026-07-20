const { Client } = require('pg');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  console.log('Reconciling drifted accounts...');

  // Set openingBalance = balance for accounts with 0 transactions
  const res1 = await client.query(`
    UPDATE "Account"
    SET "openingBalance" = balance
    WHERE id IN (
      '6b727cfc-8749-421b-8d91-4479adbae0f8',
      '4ef0f7bd-8842-4949-a009-e1311404ede7',
      '284f7fa2-ad26-4d38-a35b-13fd3f7df301',
      '9c81202b-1cd3-48c4-8223-52be5cf2a19f',
      '621718f6-e20f-4fa6-a769-8466285402eb',
      '98a50173-94fb-4031-bd2c-069c64232abe',
      '7a85c067-9405-4bb4-9cfa-6f72834e7088',
      'd405f0b6-ed4e-4f13-a850-6a9638e94546',
      '4e0db5fc-ed1f-4768-a714-962899f3d592',
      '4de3afc9-3a9a-4403-a277-307bb9476c0b'
    )
  `);
  console.log(`Updated ${res1.rowCount} accounts with 0 transactions to openingBalance = balance`);

  // Reconcile the Paytm wallet (id: '48395123-4be1-4da5-ad81-8cd07c1dc1fb')
  // Stored balance = 1715.00, txn sum = 715.00. Correct openingBalance is 1000.00
  const res2 = await client.query(`
    UPDATE "Account"
    SET "openingBalance" = 1000.00
    WHERE id = '48395123-4be1-4da5-ad81-8cd07c1dc1fb'
  `);
  console.log(`Updated Paytm Wallet opening balance to 1000.00`);

  await client.end();
  console.log('Done!');
}
main().catch(console.error);
