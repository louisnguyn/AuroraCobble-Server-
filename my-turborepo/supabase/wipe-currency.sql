-- Reset every website Cobble$ and ticket balance to 0 and clear their history.
-- Accounts, inventory, clans, gacha history and everything else are untouched.
--
-- Website-only: in-game Cobble$ on the Minecraft server is a separate wallet
-- and is NOT affected.
--
-- !! TAKE A BACKUP FIRST !! Supabase Dashboard -> Database -> Backups.
-- This cannot be undone.
--
-- Run in the Supabase SQL Editor.

-- ---------------------------------------------------------------------------
-- STEP 0 — see what is about to be destroyed (optional, read-only).
-- ---------------------------------------------------------------------------

SELECT currency_type,
       count(*) AS wallets,
       count(*) FILTER (WHERE balance > 0) AS wallets_with_balance,
       sum(balance) AS total_balance
FROM user_currency
GROUP BY currency_type
ORDER BY total_balance DESC NULLS LAST;

-- ---------------------------------------------------------------------------
-- STEP 1 — the wipe.
-- ---------------------------------------------------------------------------

BEGIN;

-- Cobble$ + all nine ticket wallet types. Rows are kept and zeroed rather than
-- deleted so existing accounts keep their wallet rows.
UPDATE user_currency
SET balance = 0,
    updated_at = now()
WHERE balance <> 0
  AND currency_type IN (
    'asterynpoints',
    'cobbledollars',
    'tickets',
    'mythic tickets',
    'shiny mythic tickets',
    'legendary tickets',
    'shiny legendary tickets',
    'paradox tickets',
    'shiny paradox tickets',
    'ultra beast tickets',
    'shiny ultra beast tickets'
  );

-- Transaction history for those wallets.
TRUNCATE TABLE
  user_cobbledollar_ledger,
  user_ticket_currency_ledger
RESTART IDENTITY;

COMMIT;

-- ---------------------------------------------------------------------------
-- STEP 2 — verify. Every count must be 0.
-- ---------------------------------------------------------------------------

SELECT 'wallets still holding money' AS check, count(*) AS count
FROM user_currency
WHERE balance <> 0
  AND currency_type IN (
    'asterynpoints', 'cobbledollars', 'tickets', 'mythic tickets', 'shiny mythic tickets',
    'legendary tickets', 'shiny legendary tickets', 'paradox tickets',
    'shiny paradox tickets', 'ultra beast tickets', 'shiny ultra beast tickets'
  )
UNION ALL SELECT 'cobbledollar_ledger', count(*) FROM user_cobbledollar_ledger
UNION ALL SELECT 'ticket_ledger', count(*) FROM user_ticket_currency_ledger;

-- ---------------------------------------------------------------------------
-- Optional — also zero every other wallet type (gems, anything custom).
-- Run only if STEP 0 showed a currency_type you also want cleared.
-- ---------------------------------------------------------------------------

-- UPDATE user_currency SET balance = 0, updated_at = now() WHERE balance <> 0;
