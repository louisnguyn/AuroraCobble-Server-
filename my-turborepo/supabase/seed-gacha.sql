-- Run this in Supabase: Dashboard → SQL Editor → New query → paste → Run
-- Run once. This creates one gacha pool and rewards so the Gacha page shows pools and "Open loot" works.

-- 1. Insert a gacha pool (100 gems per pull; no start/end = always active)
INSERT INTO gacha_pools (name, type, config, starts_at, ends_at)
VALUES (
  'Starter Banner',
  'open_loot',
  '{"cost": 100, "currency_type": "gems"}'::jsonb,
  NULL,
  NULL
);

-- 2. Add rewards to the pool (use the pool id from gacha_pools; adjust if your pool id is different)
-- reward_type 'pokemon' + reward_id = PokeAPI Pokémon id (sprite shown in UI). weight = relative chance (higher = more common).
INSERT INTO gacha_rewards (pool_id, reward_type, reward_id, weight)
SELECT id, 'pokemon', 25, 30   FROM gacha_pools WHERE name = 'Starter Banner' LIMIT 1 UNION ALL  -- Pikachu (common)
SELECT id, 'pokemon', 1, 50    FROM gacha_pools WHERE name = 'Starter Banner' LIMIT 1 UNION ALL  -- Bulbasaur (common)
SELECT id, 'pokemon', 4, 50    FROM gacha_pools WHERE name = 'Starter Banner' LIMIT 1 UNION ALL  -- Charmander (common)
SELECT id, 'pokemon', 7, 50    FROM gacha_pools WHERE name = 'Starter Banner' LIMIT 1 UNION ALL  -- Squirtle (common)
SELECT id, 'pokemon', 144, 10  FROM gacha_pools WHERE name = 'Starter Banner' LIMIT 1 UNION ALL  -- Articuno (rare)
SELECT id, 'pokemon', 145, 10  FROM gacha_pools WHERE name = 'Starter Banner' LIMIT 1 UNION ALL  -- Zapdos (rare)
SELECT id, 'pokemon', 146, 10  FROM gacha_pools WHERE name = 'Starter Banner' LIMIT 1;           -- Moltres (rare);

-- If your table uses different column names, fix them. Some setups use created_at/updated_at with defaults.
