require('dotenv/config');

module.exports = {
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    // Prisma 7 removed `migrate diff --shadow-database-url`; the shadow DB used by
    // `--from-migrations` (CI's schema-drift guard) is configured here instead.
    // Unset everywhere except CI, so deploys are unaffected.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
};
