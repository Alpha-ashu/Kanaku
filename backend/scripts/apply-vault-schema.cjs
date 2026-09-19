// DEPRECATED (2026-09-20): the Vault tables are now created by the Prisma
// migration prisma/migrations/20260920010000_vault_tables_rls, which also adds
// vault_lock_settings.pin_length (this script's DDL lacked it) and enables Row
// Level Security on every vault table (this script created them without it).
//
// Apply schema changes with migrations, not ad-hoc DDL:
//   npm run db:deploy --workspace backend
//
// Kept as a stub so an old runbook step fails loudly instead of silently
// creating RLS-less tables.
console.error(
  'apply-vault-schema.cjs is retired. Run `npm run db:deploy --workspace backend` ' +
    '(migration 20260920010000_vault_tables_rls) instead.',
);
process.exit(1);
