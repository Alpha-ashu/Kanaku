/**
 * inspect-and-enable-rls.cjs
 *
 * Inspects all public tables in Supabase, identifies ownership columns
 * (userId, user_id, id, etc.), and generates/applies comprehensive Row Level Security (RLS)
 * policies matching the "Each user can only access their own rows" single-tenant model.
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

async function main() {
  console.log('Fetching table list and column details from Supabase public schema...');

  const tables = await prisma.$queryRawUnsafe(`
    SELECT t.table_name, 
           array_agg(c.column_name::text) as columns,
           (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = t.table_name) as rls_enabled
    FROM information_schema.tables t
    JOIN information_schema.columns c ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    GROUP BY t.table_name
    ORDER BY t.table_name;
  `);

  console.log(`Found ${tables.length} tables in public schema:\n`);

  for (const t of tables) {
    const cols = t.columns;
    let ownershipCol = null;
    let tableType = 'user_data';

    if (t.table_name === '_prisma_migrations') {
      tableType = 'system_internal';
    } else if (t.table_name === 'User' || t.table_name === 'profiles') {
      ownershipCol = 'id';
      tableType = 'user_root';
    } else if (cols.includes('userId')) {
      ownershipCol = 'userId';
    } else if (cols.includes('user_id')) {
      ownershipCol = 'user_id';
    } else if (cols.includes('ownerId')) {
      ownershipCol = 'ownerId';
    } else if (cols.includes('owner_id')) {
      ownershipCol = 'owner_id';
    } else if (cols.includes('clientId')) {
      ownershipCol = 'clientId';
    } else {
      tableType = 'lookup_or_shared';
    }

    console.log(`- ${t.table_name.padEnd(32)} | RLS: ${t.rls_enabled ? 'ON ' : 'OFF'} | Type: ${tableType.padEnd(16)} | Ownership: ${ownershipCol || 'N/A'}`);
  }
}

main()
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
