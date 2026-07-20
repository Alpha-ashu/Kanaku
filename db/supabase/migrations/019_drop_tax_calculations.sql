-- ============================================================================
-- Migration 019: Drop the Tax Calculator feature
-- ----------------------------------------------------------------------------
-- The Tax Calculator (estimate tax liability for different countries) has been
-- removed from the application. This drops its backing table along with its
-- RLS policies and the updated_at trigger (removed implicitly via CASCADE).
-- ============================================================================

DROP TABLE IF EXISTS public.tax_calculations CASCADE;
