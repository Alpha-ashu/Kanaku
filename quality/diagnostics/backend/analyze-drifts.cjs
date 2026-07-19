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

  const query = `
    SELECT
      a.id,
      a.name,
      CAST(a.balance AS NUMERIC(12,2))           AS stored_balance,
      CAST(a."openingBalance" AS NUMERIC(12,2))  AS opening_balance,
      (
        SELECT COUNT(*) FROM "Transaction" t
        WHERE t."accountId" = a.id AND t."deletedAt" IS NULL
      ) AS txn_count,
      (
        SELECT COUNT(*) FROM "Transaction" t
        WHERE t.type = 'transfer' AND t."transferToAccountId" = a.id AND t."deletedAt" IS NULL
      ) AS transfer_target_count
    FROM "Account" a
    WHERE a."isActive" = true AND a."deletedAt" IS NULL
    AND ABS(
      a.balance - (
        a."openingBalance" +
        COALESCE((
          SELECT SUM(
            CASE
              WHEN t.type = 'income' THEN t.amount
              WHEN t.type IN ('expense', 'withdrawal', 'transfer') THEN -t.amount
              ELSE 0
            END
          )
          FROM "Transaction" t
          WHERE t."accountId" = a.id AND t."deletedAt" IS NULL
        ), 0) +
        COALESCE((
          SELECT SUM(t.amount)
          FROM "Transaction" t
          WHERE t.type = 'transfer' AND t."transferToAccountId" = a.id AND t."deletedAt" IS NULL
        ), 0)
      )
    ) > 0.01
  `;

  const { rows } = await client.query(query);
  console.log('DRIFTED ACCOUNTS:', rows);

  await client.end();
}
main();
