/**
 * inspect-7-tables.cjs
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

async function main() {
  const list = [
    'user_features',
    'recurring_transactions',
    'user_learning',
    'todo_lists',
    'todo_items',
    'todo_list_shares',
    'recurring_executions'
  ];

  for (const t of list) {
    const res = await prisma.$queryRawUnsafe(`
      SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = '${t}';
    `);
    const cols = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${t}';
    `);
    const pols = await prisma.$queryRawUnsafe(`
      SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = '${t}';
    `);

    console.log(`\n========================================`);
    console.log(`Table: ${t}`);
    console.log(`RLS Enabled: ${res[0]?.rowsecurity === true ? 'YES' : 'NO'}`);
    console.log(`Columns: ${cols.map(c => `${c.column_name} (${c.data_type})`).join(', ')}`);
    console.log(`Policies: ${pols.length > 0 ? pols.map(p => p.policyname).join(', ') : 'NONE'}`);
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
