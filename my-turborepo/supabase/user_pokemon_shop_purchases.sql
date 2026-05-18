-- Run in Supabase SQL Editor.
-- Purchases from rotating Pokemon shop (6 mixed shiny/normal slots per window).

CREATE TABLE IF NOT EXISTS user_pokemon_shop_purchases (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  slot integer NOT NULL,
  species text NOT NULL,
  category text NOT NULL,
  price integer NOT NULL,
  shiny boolean NOT NULL DEFAULT true,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One purchase per rotation slot globally (first buyer wins for everyone).
CREATE UNIQUE INDEX IF NOT EXISTS uq_pokemon_shop_window_slot_global
  ON user_pokemon_shop_purchases (window_start, slot);

CREATE INDEX IF NOT EXISTS idx_user_pokemon_shop_purchases_user_purchased
  ON user_pokemon_shop_purchases (user_id, purchased_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_pokemon_shop_purchases_window
  ON user_pokemon_shop_purchases (window_start);
