-- Delete every website account except admins (`users.is_admin = true`).
-- Also wipe all profile badges (achievement grants). Badge definitions
-- (the catalog staff can grant) are kept — uncomment STEP 1b to wipe those too.
--
-- Cascades clear wallets, inventory, owned ranks, gacha history, etc. for
-- deleted users. Clan rows and a few RESTRICT FKs are cleared first.
--
-- !! TAKE A BACKUP FIRST !! Supabase Dashboard -> Database -> Backups.
-- This cannot be undone.
--
-- Run in the Supabase SQL Editor. Run STEP 0 first, then STEP 1.

-- ---------------------------------------------------------------------------
-- STEP 0 — preview (read-only). Confirm who is kept.
-- ---------------------------------------------------------------------------

SELECT id, username, email, is_admin, created_at
FROM users
WHERE is_admin IS TRUE
ORDER BY id;

SELECT
  (SELECT count(*) FROM users) AS users_total,
  (SELECT count(*) FROM users WHERE is_admin IS TRUE) AS users_kept_admin,
  (SELECT count(*) FROM users WHERE is_admin IS DISTINCT FROM TRUE) AS users_to_delete,
  (SELECT count(*) FROM profile_achievement_grants) AS badge_grants_to_clear;

-- ---------------------------------------------------------------------------
-- STEP 1 — wipe.
-- ---------------------------------------------------------------------------

BEGIN;

-- Abort if no admin would remain (prevents wiping every account by mistake).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE is_admin IS TRUE) THEN
    RAISE EXCEPTION 'No users with is_admin = true — aborting so accounts are not all deleted.';
  END IF;
END $$;

-- All granted badges (every user, including admins).
TRUNCATE TABLE profile_achievement_grants RESTART IDENTITY;

-- Optional STEP 1b: also wipe badge catalog (definitions).
-- TRUNCATE TABLE profile_achievement_definitions RESTART IDENTITY CASCADE;

-- Tables that block DELETE users (RESTRICT / no ON DELETE).
DO $$
DECLARE
  t text;
  targets text[] := ARRAY[
    'clan_admin_xp_grants',
    'clan_leaderboard_daily_payouts',
    'clan_daily_member_income_payouts',
    'clan_xp_grants',
    'clan_donations',
    'clan_disbursements',
    'clan_member_leaves',
    'clan_join_requests',
    'clan_members',
    'clans',
    'ranked_battle_staff_events'
  ];
BEGIN
  FOREACH t IN ARRAY targets LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', t);
    END IF;
  END LOOP;
END $$;

-- Clear staff pointers on rows that may outlive non-admin users.
DO $$
BEGIN
  IF to_regclass('public.cobble_ranked_feed_reviews') IS NOT NULL THEN
    UPDATE cobble_ranked_feed_reviews
    SET reviewed_by_user_id = NULL
    WHERE reviewed_by_user_id IS NOT NULL
      AND reviewed_by_user_id NOT IN (SELECT id FROM users WHERE is_admin IS TRUE);
  END IF;
  IF to_regclass('public.user_verification_requests') IS NOT NULL THEN
    UPDATE user_verification_requests
    SET resolved_by_user_id = NULL
    WHERE resolved_by_user_id IS NOT NULL
      AND resolved_by_user_id NOT IN (SELECT id FROM users WHERE is_admin IS TRUE);
  END IF;
  IF to_regclass('public.battlepass_lp_grants') IS NOT NULL THEN
    UPDATE battlepass_lp_grants
    SET website_user_id = NULL
    WHERE website_user_id IS NOT NULL
      AND website_user_id NOT IN (SELECT id FROM users WHERE is_admin IS TRUE);
    UPDATE battlepass_lp_grants
    SET granted_by_user_id = NULL
    WHERE granted_by_user_id IS NOT NULL
      AND granted_by_user_id NOT IN (SELECT id FROM users WHERE is_admin IS TRUE);
  END IF;
END $$;

-- Delete every non-admin account (child rows with ON DELETE CASCADE go with them).
DELETE FROM users
WHERE is_admin IS DISTINCT FROM TRUE;

COMMIT;

-- ---------------------------------------------------------------------------
-- STEP 2 — verify. users_non_admin and badge_grants must be 0.
-- ---------------------------------------------------------------------------

SELECT 'users_total' AS check, count(*)::bigint AS count FROM users
UNION ALL
SELECT 'users_admin', count(*) FROM users WHERE is_admin IS TRUE
UNION ALL
SELECT 'users_non_admin', count(*) FROM users WHERE is_admin IS DISTINCT FROM TRUE
UNION ALL
SELECT 'badge_grants', count(*) FROM profile_achievement_grants
UNION ALL
SELECT 'badge_definitions', count(*) FROM profile_achievement_definitions;
