-- Widen / refresh badge tier palette (run after profile_achievements.sql).
-- Prefer migrate-badge-tiers-mythic-legend.sql if upgrading from crimson/mythic.

ALTER TABLE profile_achievement_definitions
  DROP CONSTRAINT IF EXISTS profile_achievement_definitions_tier_check;

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
