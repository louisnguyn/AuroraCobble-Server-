-- Wipe all profile badge types (definitions) and every grant of those badges.
-- Catalog is emptied — staff must recreate badge types in Admin before granting again.
--
-- !! TAKE A BACKUP FIRST !!
-- Run in the Supabase SQL Editor.

BEGIN;

TRUNCATE TABLE profile_achievement_grants RESTART IDENTITY;
TRUNCATE TABLE profile_achievement_definitions RESTART IDENTITY CASCADE;

COMMIT;

SELECT 'badge_definitions' AS check, count(*) AS count FROM profile_achievement_definitions
UNION ALL
SELECT 'badge_grants', count(*) FROM profile_achievement_grants;
