-- Run after tournament.sql. Maps each quarter-final to a qualifier: qf_qual_feed[i] ∈ {0,1,2,3} = winner of qual-i meets top seed (i+1) in QF (i+1).

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS qf_qual_feed jsonb NOT NULL DEFAULT '[3, 2, 1, 0]'::jsonb;

COMMENT ON COLUMN tournaments.qf_qual_feed IS
  'JSON array of 4 integers 0–3, permutation: QF slot i gets winner of qual-(feed[i]).';
