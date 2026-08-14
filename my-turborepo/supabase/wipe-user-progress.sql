-- Wipe all website user progression for a fresh start. Accounts are KEPT.
--
-- Removed: Cobble$ + ticket balances and their ledgers, inventory, gacha pull
-- history, Pokémon shop purchase history, daily login / PvP daily reward
-- claims, battle pass premium+party grants, and the entire clan system.
--
-- Kept: users, PvP ELO mirror (user_pvp_ranks), saved teams, achievements,
-- tournaments, public profiles, verification requests, ranked leaderboard.
--
-- !! TAKE A BACKUP FIRST !! Supabase Dashboard -> Database -> Backups, or pg_dump.
-- This cannot be undone.
--
-- Run in the Supabase SQL Editor. Do STEP 0 before STEP 1.
-- Missing tables are skipped automatically (your DB may not have every clan_* table).

-- ---------------------------------------------------------------------------
-- STEP 0 — export battle pass grants BEFORE wiping.
--
-- Deleting battlepass_lp_grants only clears the website mirror; the LuckPerms
-- permissions stay on the Minecraft server. Run this SELECT on its own, copy
-- the resulting lines into a file, and run them over RCON to actually revoke.
-- Skip this step only if you want players to keep battle pass perks in game.
-- ---------------------------------------------------------------------------

SELECT 'lp user ' || minecraft_username || ' permission unset ' ||
       CASE kind
         WHEN 'premium' THEN 'mbattlepass.player.premium'
         ELSE 'mbattlepass.party.create'
       END AS rcon_command
FROM battlepass_lp_grants
WHERE active = true
ORDER BY minecraft_username;

-- ---------------------------------------------------------------------------
-- STEP 1 — the wipe.
-- ---------------------------------------------------------------------------

BEGIN;

DO $$
DECLARE
  t text;
  targets text[] := ARRAY[
    'user_cobbledollar_ledger',
    'user_ticket_currency_ledger',
    'user_inventory',
    'user_gacha_pulls',
    'user_pokemon_shop_purchases',
    'user_daily_login_claims',
    'user_pvp_daily_payouts',
    'battlepass_lp_grants',
    'clans',
    'clan_members',
    'clan_join_requests',
    'clan_donations',
    'clan_disbursements',
    'clan_xp_grants',
    'clan_admin_xp_grants',
    'clan_member_leaves',
    'clan_daily_member_income_payouts',
    'clan_leaderboard_daily_payouts'
  ];
BEGIN
  FOREACH t IN ARRAY targets LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', t);
    END IF;
  END LOOP;
END $$;

-- Zero every wallet (Cobble$, tickets, gems…). Rows are kept so existing
-- accounts keep their wallet rows; the backend recreates missing ones anyway.
UPDATE user_currency
SET balance = 0,
    updated_at = now()
WHERE balance <> 0;

COMMIT;

-- ---------------------------------------------------------------------------
-- STEP 2 — verify. Every count must be 0 (missing tables show as skipped).
-- ---------------------------------------------------------------------------

SELECT check_name AS check, cnt AS count
FROM (
  SELECT 'user_currency non-zero' AS check_name,
         (SELECT count(*) FROM user_currency WHERE balance <> 0) AS cnt
  UNION ALL
  SELECT 'cobbledollar_ledger',
         CASE WHEN to_regclass('public.user_cobbledollar_ledger') IS NULL THEN -1
              ELSE (SELECT count(*) FROM user_cobbledollar_ledger) END
  UNION ALL
  SELECT 'ticket_ledger',
         CASE WHEN to_regclass('public.user_ticket_currency_ledger') IS NULL THEN -1
              ELSE (SELECT count(*) FROM user_ticket_currency_ledger) END
  UNION ALL
  SELECT 'inventory',
         CASE WHEN to_regclass('public.user_inventory') IS NULL THEN -1
              ELSE (SELECT count(*) FROM user_inventory) END
  UNION ALL
  SELECT 'gacha_pulls',
         CASE WHEN to_regclass('public.user_gacha_pulls') IS NULL THEN -1
              ELSE (SELECT count(*) FROM user_gacha_pulls) END
  UNION ALL
  SELECT 'shop_purchases',
         CASE WHEN to_regclass('public.user_pokemon_shop_purchases') IS NULL THEN -1
              ELSE (SELECT count(*) FROM user_pokemon_shop_purchases) END
  UNION ALL
  SELECT 'daily_login_claims',
         CASE WHEN to_regclass('public.user_daily_login_claims') IS NULL THEN -1
              ELSE (SELECT count(*) FROM user_daily_login_claims) END
  UNION ALL
  SELECT 'pvp_daily_payouts',
         CASE WHEN to_regclass('public.user_pvp_daily_payouts') IS NULL THEN -1
              ELSE (SELECT count(*) FROM user_pvp_daily_payouts) END
  UNION ALL
  SELECT 'battlepass_grants',
         CASE WHEN to_regclass('public.battlepass_lp_grants') IS NULL THEN -1
              ELSE (SELECT count(*) FROM battlepass_lp_grants) END
  UNION ALL
  SELECT 'clans',
         CASE WHEN to_regclass('public.clans') IS NULL THEN -1
              ELSE (SELECT count(*) FROM clans) END
  UNION ALL
  SELECT 'clan_members',
         CASE WHEN to_regclass('public.clan_members') IS NULL THEN -1
              ELSE (SELECT count(*) FROM clan_members) END
) v;
-- count = -1 means that table does not exist on this database (skipped).
