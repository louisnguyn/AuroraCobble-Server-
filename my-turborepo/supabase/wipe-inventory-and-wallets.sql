-- Wipe website inventory + every wallet balance (+ currency history).
-- Accounts, achievements, clans, ranks, etc. are untouched.
--
-- Website-only: in-game Cobble$ on Minecraft is NOT affected.
--
-- !! TAKE A BACKUP FIRST !! Supabase Dashboard -> Database -> Backups.
-- This cannot be undone.
--
-- Run in the Supabase SQL Editor.

BEGIN;

-- Inventory items waiting for in-game redemption.
TRUNCATE TABLE user_inventory RESTART IDENTITY;

-- Currency history (balances live in user_currency below).
TRUNCATE TABLE
  user_cobbledollar_ledger,
  user_ticket_currency_ledger
RESTART IDENTITY;

-- Zero EVERY wallet type (cobbledollars, tickets, gems, anything else).
UPDATE user_currency
SET balance = 0,
    updated_at = now()
WHERE balance <> 0;

COMMIT;

-- Verify — every count must be 0.
SELECT 'inventory' AS check, count(*) FROM user_inventory
UNION ALL SELECT 'wallets holding money', count(*) FROM user_currency WHERE balance <> 0
UNION ALL SELECT 'cobbledollar_ledger', count(*) FROM user_cobbledollar_ledger
UNION ALL SELECT 'ticket_ledger', count(*) FROM user_ticket_currency_ledger;
