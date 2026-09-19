require('dotenv/config');

module.exports = {
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    // Prisma 7 takes the shadow database from config (the old
    // --shadow-database-url flag is gone). Only `migrate diff
    // --from-migrations` (CI's drift guard) and `migrate dev` need it.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL || undefined,
  },
};
