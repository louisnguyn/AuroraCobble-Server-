-- Rename profile achievement tiers:
--   crimson → mythic (purple)
--   mythic  → legend (orange)
--
-- Run in Supabase SQL Editor before/with the new Backend deploy.
-- Order matters: rename old mythic first so it does not collide.

BEGIN;

-- Drop old check so we can rewrite values.
ALTER TABLE profile_achievement_definitions
  DROP CONSTRAINT IF EXISTS profile_achievement_definitions_tier_check;

-- old mythic → legend
UPDATE profile_achievement_definitions
SET tier = 'legend', updated_at = now()
WHERE tier = 'mythic';

-- old crimson → mythic
UPDATE profile_achievement_definitions
SET tier = 'mythic', updated_at = now()
WHERE tier = 'crimson';

ALTER TABLE profile_achievement_definitions
  ADD CONSTRAINT profile_achievement_definitions_tier_check CHECK (
    tier IN (
      'silver',
      'cyan',
      'emerald',
      'violet',
      'rose',
      'gold',
      'mythic',
      'legend'
    )
  );

COMMIT;

SELECT tier, count(*) FROM profile_achievement_definitions GROUP BY tier ORDER BY tier;
