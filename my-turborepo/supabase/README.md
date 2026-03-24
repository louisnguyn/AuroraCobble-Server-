# Making Gacha Available

The Gacha page shows **"No gacha pools available yet"** until you add at least one pool and its rewards in Supabase.

## Quick setup (recommended)

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project.
2. Go to **SQL Editor** → **New query**.
3. Paste the contents of **`seed-gacha.sql`** and click **Run**.
4. Refresh your app: the Gacha page should list **Starter Banner** and you can spend 100 gems per pull (new users get 500 gems on signup).

## What the seed does

- Inserts one pool: **Starter Banner** (open loot, 100 gems per pull).
- Adds 7 Pokémon rewards with weights (common: Bulbasaur, Charmander, Squirtle, Pikachu; rare: Articuno, Zapdos, Moltres).

## Add more pools or rewards yourself

- **gacha_pools**: `name`, `type` (e.g. `open_loot`), `config` (e.g. `{"cost": 100, "currency_type": "gems"}`), `starts_at` / `ends_at` (optional, NULL = always active).
- **gacha_rewards**: `pool_id` (id from `gacha_pools`), `reward_type` (e.g. `pokemon`), `reward_id` (e.g. PokeAPI id), `weight` (higher = more likely).

Run the seed only once; running it again will create a second "Starter Banner" pool.

## Minecraft admin streak / offline time

1. In **SQL Editor**, run **`minecraft_player_presence.sql`** once.
2. This enables **day streak** and **offline duration** on the Admin → Minecraft dashboard (stored when you open/refresh that page).
