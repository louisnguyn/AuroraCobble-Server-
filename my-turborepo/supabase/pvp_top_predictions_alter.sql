-- Run once if pvp_top_predictions already exists (old schema: stake > 0 only, no slot columns).

ALTER TABLE pvp_top_predictions
  ADD COLUMN IF NOT EXISTS stake_rank1_only integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pick_rank1_only text NULL,
  ADD COLUMN IF NOT EXISTS stake_rank2_only integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pick_rank2_only text NULL,
  ADD COLUMN IF NOT EXISTS stake_rank3_only integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pick_rank3_only text NULL;

ALTER TABLE pvp_top_predictions DROP CONSTRAINT IF EXISTS pvp_top_predictions_stake_check;

-- Allow stake = 0 when only slot bets are used (drop old "stake > 0" check if present).
ALTER TABLE pvp_top_predictions
  ALTER COLUMN stake SET DEFAULT 0;

ALTER TABLE pvp_top_predictions
  ALTER COLUMN pick_rank1_name SET DEFAULT '',
  ALTER COLUMN pick_rank2_name SET DEFAULT '',
  ALTER COLUMN pick_rank3_name SET DEFAULT '';

ALTER TABLE pvp_top_predictions DROP CONSTRAINT IF EXISTS pvp_top_predictions_total_stake_positive;
ALTER TABLE pvp_top_predictions ADD CONSTRAINT pvp_top_predictions_total_stake_positive
  CHECK (stake + stake_rank1_only + stake_rank2_only + stake_rank3_only > 0);

ALTER TABLE pvp_top_predictions DROP CONSTRAINT IF EXISTS pvp_top_predictions_stakes_non_negative;
ALTER TABLE pvp_top_predictions ADD CONSTRAINT pvp_top_predictions_stakes_non_negative CHECK (
  stake >= 0
  AND stake_rank1_only >= 0
  AND stake_rank2_only >= 0
  AND stake_rank3_only >= 0
);
