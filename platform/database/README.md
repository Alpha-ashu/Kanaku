# Database

This folder contains raw database artifacts that are separate from the Prisma application schema.

## Contents

- `init.sql`: base SQL bootstrap
- `supabase_schema.sql`: direct SQL representation of the Supabase-oriented schema
- `ai_schema.sql`: AI-related table definitions
- `models.js`, `migrations.js`: older direct-database helpers

## Use this folder for

- direct SQL review
- one-off schema comparison
- non-Prisma database bootstrap helpers

## Do not treat this folder as the only schema authority

The live application model is split across:

- `backend/prisma/schema.prisma` for backend runtime ownership
- `supabase/migrations/` for Supabase SQL/RLS/storage concerns
- this folder for raw SQL references and legacy bootstrap material

If you change a core entity, update the authoritative runtime schema and the required Supabase SQL path deliberately.
