-- Remove the Tax Calculator feature.
-- Drops the tax_calculations table (and, via CASCADE, its indexes and the
-- foreign key from the owning user). No other table references it.
DROP TABLE IF EXISTS "tax_calculations" CASCADE;
