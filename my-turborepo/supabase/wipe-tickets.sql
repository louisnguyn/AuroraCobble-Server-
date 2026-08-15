-- Wipe website AsterynPoints, all ticket types, ticket/AP ledgers,
-- gacha pull history, and Pokémon shop purchase history for every user.
--
-- Kept: inventory, clans, accounts, gacha pool config, in-game Minecraft wallets.
--
-- !! TAKE A BACKUP FIRST !! Supabase Dashboard -> Database -> Backups.
-- This cannot be undone.
--
-- Run in the Supabase SQL Editor.

BEGIN;

UPDATE user_currency
SET balance = 0,
    updated_at = now()
WHERE currency_type IN (
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
  )
  AND balance <> 0;

TRUNCATE TABLE user_cobbledollar_ledger RESTART IDENTITY;
TRUNCATE TABLE user_ticket_currency_ledger RESTART IDENTITY;
TRUNCATE TABLE user_gacha_pulls RESTART IDENTITY;
TRUNCATE TABLE user_pokemon_shop_purchases RESTART IDENTITY;

COMMIT;

SELECT 'asteryn_point wallets non-zero' AS check, count(*) AS count
FROM user_currency
WHERE currency_type IN ('asterynpoints', 'cobbledollars') AND balance <> 0
UNION ALL
SELECT 'ticket wallets non-zero', count(*)
FROM user_currency
WHERE currency_type IN (
    'tickets',
    'mythic tickets',
    'shiny mythic tickets',
    'legendary tickets',
    'shiny legendary tickets',
    'paradox tickets',
    'shiny paradox tickets',
    'ultra beast tickets',
    'shiny ultra beast tickets'
  )
  AND balance <> 0
UNION ALL
SELECT 'asteryn_point ledger', count(*) FROM user_cobbledollar_ledger
UNION ALL
SELECT 'ticket_ledger', count(*) FROM user_ticket_currency_ledger
UNION ALL
SELECT 'gacha_pulls', count(*) FROM user_gacha_pulls
UNION ALL
SELECT 'shop_purchases', count(*) FROM user_pokemon_shop_purchases;
