-- Remove legacy PVP top-3 prediction table (replaced by tournament_prediction.sql).
-- Run in Supabase SQL Editor after tournament_prediction.sql is applied.
-- This deletes all historical PVP prediction rows permanently.

DROP TABLE IF EXISTS public.pvp_top_predictions CASCADE;
