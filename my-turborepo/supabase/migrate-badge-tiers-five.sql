-- Profile badge tiers: keep only violet, rose, gold, mythic, legend (scores 1–5).
-- Removes silver / cyan / emerald definitions (grants cascade).
-- Run in Supabase SQL Editor, then redeploy Backend.

BEGIN;

-- Drop old check so we can rewrite / delete values.
ALTER TABLE profile_achievement_definitions
  DROP CONSTRAINT IF EXISTS profile_achievement_definitions_tier_check;

-- Optional remaps if any still use pre–mythic/legend names.
UPDATE profile_achievement_definitions
SET tier = 'legend', updated_at = now()
WHERE tier = 'crimson';

-- Drop retired low tiers (grants deleted via ON DELETE CASCADE).
DELETE FROM profile_achievement_definitions
WHERE tier IN ('silver', 'cyan', 'emerald');

ALTER TABLE profile_achievement_definitions
  ADD CONSTRAINT profile_achievement_definitions_tier_check CHECK (
    tier IN (
      'violet',
      'rose',
      'gold',
      'mythic',
      'legend'
    )
  );

COMMIT;

SELECT tier, count(*) FROM profile_achievement_definitions GROUP BY tier ORDER BY tier;
