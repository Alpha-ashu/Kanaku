import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 config. Replaces the `url` / `directUrl` fields that used to live in
 * schema.prisma's `datasource` block — both were removed upstream (Prisma 7
 * requires `datasources.url` be set only via `prisma.config.ts` or a driver
 * adapter, never in the schema file itself).
 *
 * This file is CLI-only (generate, migrate, db push, migrate status/diff). The
 * running application never reads it — `src/db/prisma.ts` constructs its own
 * `PrismaPg` adapter per client, which is how the write/read-replica split and
 * the test-environment URL override already worked before this migration and
 * still do.
 *
 * `DIRECT_URL` over `DATABASE_URL` deliberately: DATABASE_URL is the pgbouncer
 * pooled connection (transaction-mode), which cannot run schema-altering DDL —
 * `prisma migrate` / `db push` need the direct connection. This mirrors the old
 * schema.prisma split (`url = env("DATABASE_URL")`, `directUrl =
 * env("DIRECT_URL")`), where Prisma automatically used directUrl for exactly
 * these CLI commands; that automatic split no longer exists in v7, so it is
 * reproduced explicitly here. Falls back to DATABASE_URL so a local/dev setup
 * that only defines one URL still works.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
});
