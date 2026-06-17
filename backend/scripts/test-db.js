const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

async function run() {
  console.log('Connecting to database via Prisma...');
  
  // 1. Check if we can query
  const tables = await prisma.$queryRawUnsafe(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public'
  `);
  console.log('Tables:', tables.map(r => r.table_name));

  // 2. Create Todo tables if missing
  console.log('Ensuring todo_lists table exists...');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public.todo_lists (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT REFERENCES public."User"(id) ON DELETE CASCADE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      archived BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  console.log('Ensuring todo_items table exists...');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public.todo_items (
      id BIGSERIAL PRIMARY KEY,
      list_id BIGINT REFERENCES public.todo_lists(id) ON DELETE CASCADE NOT NULL,
      user_id TEXT REFERENCES public."User"(id) ON DELETE CASCADE NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      completed BOOLEAN DEFAULT false,
      priority TEXT CHECK (priority IN ('low', 'medium', 'high')) DEFAULT 'medium',
      due_date TIMESTAMPTZ,
      created_by TEXT REFERENCES public."User"(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `);

  console.log('Ensuring todo_list_shares table exists...');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public.todo_list_shares (
      id BIGSERIAL PRIMARY KEY,
      list_id BIGINT REFERENCES public.todo_lists(id) ON DELETE CASCADE NOT NULL,
      shared_with_user_id TEXT REFERENCES public."User"(id) ON DELETE CASCADE NOT NULL,
      shared_by TEXT REFERENCES public."User"(id) ON DELETE CASCADE NOT NULL,
      permission TEXT CHECK (permission IN ('view', 'edit')) DEFAULT 'view',
      shared_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(list_id, shared_with_user_id)
    )
  `);

  console.log('Done!');
  await prisma.$disconnect();
}

run().catch(err => {
  console.error('Prisma script failed:', err);
  prisma.$disconnect();
  process.exit(1);
});
