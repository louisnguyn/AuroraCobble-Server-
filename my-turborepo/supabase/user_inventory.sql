-- Run in Supabase SQL Editor.
-- Website inventory (items are stored here before in-game redemption).

CREATE TABLE IF NOT EXISTS user_inventory (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_inventory_user_item
  ON user_inventory (user_id, item_key);
-- Run in Supabase SQL Editor.
-- Generic website inventory (balls, candies, etc.) before in-game fulfillment.

CREATE TABLE IF NOT EXISTS user_inventory (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_inventory_user_item
  ON user_inventory (user_id, item_key);
