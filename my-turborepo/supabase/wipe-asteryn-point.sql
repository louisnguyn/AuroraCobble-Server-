-- Wipe all website Asteryn Point (DB currency_type = 'asterynpoints').
-- Also clears leftover legacy `cobbledollars` rows if migration was not run.
-- Tickets, inventory, clans, accounts, and in-game Cobble$ are NOT touched.
--
-- !! TAKE A BACKUP FIRST !! Supabase Dashboard -> Database -> Backups.
-- This cannot be undone.
--
-- Run in the Supabase SQL Editor.

BEGIN;

UPDATE user_currency
SET balance = 0,
    updated_at = now()
WHERE currency_type IN ('asterynpoints', 'cobbledollars')
  AND balance <> 0;

TRUNCATE TABLE user_cobbledollar_ledger RESTART IDENTITY;

COMMIT;

SELECT 'asteryn_point wallets non-zero' AS check, count(*) AS count
FROM user_currency
WHERE currency_type IN ('asterynpoints', 'cobbledollars') AND balance <> 0
UNION ALL
SELECT 'asteryn_point ledger', count(*) FROM user_cobbledollar_ledger;
