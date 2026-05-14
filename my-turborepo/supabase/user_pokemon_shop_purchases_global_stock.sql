-- Pokemon shop: one sale per (window_start, slot) globally (not per user).
-- Run in Supabase SQL Editor after user_pokemon_shop_purchases.sql.
--
-- If CREATE UNIQUE INDEX fails with duplicate (window_start, slot), old data had
-- multiple users buying the same slot in one window. Below we keep ONE row per
-- (window_start, slot): earliest purchased_at, then lowest id (first buyer wins).
-- Removed rows no longer appear in purchase history; refund those users manually if needed.

DROP INDEX IF EXISTS uq_user_pokemon_shop_window_slot;

-- Remove duplicate (window_start, slot); keep earliest purchase per pair.
DELETE FROM user_pokemon_shop_purchases p
WHERE p.id NOT IN (
  SELECT DISTINCT ON (window_start, slot) id
  FROM user_pokemon_shop_purchases
  ORDER BY window_start, slot, purchased_at ASC NULLS LAST, id ASC
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pokemon_shop_window_slot_global
  ON user_pokemon_shop_purchases (window_start, slot);

CREATE INDEX IF NOT EXISTS idx_user_pokemon_shop_purchases_window
  ON user_pokemon_shop_purchases (window_start);
