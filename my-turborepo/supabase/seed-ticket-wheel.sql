-- Ticket wheel: 1 normal ticket per pull. Weights are Hardcore Weight × 1000 (integer).
-- Reward text: item|{id}|{min}-{max}|{label}  or  currency|{key}|1|{label}
-- Run in Supabase SQL editor. Safe to re-run (replaces rewards on the Ticket Wheel pool).
--
-- If you saw gacha_pools_pkey id=10: the serial was behind existing rows
-- (common after manual inserts). setval below resyncs before INSERT.

SELECT setval(
  pg_get_serial_sequence('gacha_pools', 'id'),
  COALESCE((SELECT MAX(id) FROM gacha_pools), 1),
  (SELECT EXISTS (SELECT 1 FROM gacha_pools))
);

SELECT setval(
  pg_get_serial_sequence('gacha_rewards', 'id'),
  COALESCE((SELECT MAX(id) FROM gacha_rewards), 1),
  (SELECT EXISTS (SELECT 1 FROM gacha_rewards))
);

-- Reuse an existing ticket_wheel row if the name differs.
UPDATE gacha_pools
SET name = 'Ticket Wheel'
WHERE type = 'ticket_wheel'
  AND name IS DISTINCT FROM 'Ticket Wheel'
  AND NOT EXISTS (SELECT 1 FROM gacha_pools WHERE name = 'Ticket Wheel');

INSERT INTO gacha_pools (name, type, config, starts_at, ends_at)
SELECT
  'Ticket Wheel',
  'ticket_wheel',
  '{"cost": 1, "currency_type": "tickets"}'::jsonb,
  NULL,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM gacha_pools
  WHERE name = 'Ticket Wheel' OR type = 'ticket_wheel'
);

UPDATE gacha_pools
SET
  type = 'ticket_wheel',
  config = '{"cost": 1, "currency_type": "tickets"}'::jsonb,
  starts_at = NULL,
  ends_at = NULL
WHERE name = 'Ticket Wheel';

-- Hide older banners from the Gacha page.
UPDATE gacha_pools
SET ends_at = NOW() - INTERVAL '1 day'
WHERE name IS DISTINCT FROM 'Ticket Wheel'
  AND (ends_at IS NULL OR ends_at > NOW());

DELETE FROM gacha_rewards
WHERE pool_id IN (SELECT id FROM gacha_pools WHERE name = 'Ticket Wheel');

INSERT INTO gacha_rewards (pool_id, reward_type, weight)
SELECT p.id, v.reward_type, v.weight
FROM gacha_pools p
CROSS JOIN (
  VALUES
    -- Common (kept as the bulk of the wheel)
    ('item|cobblemon:poke_ball|2-4|Poke Ball', 50000),
    ('item|cobblemon:premier_ball|2-4|Premier Ball', 50000),
    ('item|cobblemon:sport_ball|2-4|Sport Ball', 50000),
    ('item|cobblemon:luxury_ball|2-4|Luxury Ball', 50000),
    ('item|cobblemon:lure_ball|2-4|Lure Ball', 50000),
    ('item|cobblemon:park_ball|2-4|Park Ball', 50000),
    ('item|cobblemon:love_ball|2-4|Love Ball', 50000),
    ('item|cobblemon:heal_ball|2-4|Heal Ball', 50000),
    ('item|cobblemon:net_ball|2-4|Net Ball', 50000),
    ('item|cobblemon:dive_ball|2-4|Dive Ball', 50000),
    ('item|cobblemon:friend_ball|2-4|Friend Ball', 50000),
    ('item|cobblemon:repeat_ball|2-4|Repeat Ball', 50000),
    ('item|cobblemon:nest_ball|2-4|Nest Ball', 50000),
    ('item|cobblemon:ancient_poke_ball|2-4|Ancient Poke Ball', 50000),
    ('item|cobblemon:ancient_slate_ball|2-4|Ancient Slate Ball', 50000),
    ('item|cobblemon:ancient_ivory_ball|2-4|Ancient Ivory Ball', 50000),
    ('item|cobblemon:ancient_citrine_ball|2-4|Ancient Citrine Ball', 50000),
    ('item|cobblemon:ancient_azure_ball|2-4|Ancient Azure Ball', 50000),
    ('item|cobblemon:ancient_roseate_ball|2-4|Ancient Roseate Ball', 50000),
    ('item|cobblemon:ancient_verdant_ball|2-4|Ancient Verdant Ball', 50000),
    ('item|cobblemon:ancient_feather_ball|2-4|Ancient Feather Ball', 50000),
    ('item|cobblemon:ancient_heavy_ball|2-4|Ancient Heavy Ball', 50000),
    ('item|cobblemon:potion|1-2|Potion', 50000),
    ('item|cobblemon:antidote|1-2|Antidote', 50000),
    ('item|cobblemon:paralyze_heal|1-2|Paralyze Heal', 50000),
    ('item|cobblemon:awakening|1-2|Awakening', 50000),
    ('item|cobblemon:burn_heal|1-2|Burn Heal', 50000),
    ('item|cobblemon:ice_heal|1-2|Ice Heal', 50000),
    -- Uncommon (15 → 6000)
    ('item|cobblemon:great_ball|2-4|Great Ball', 6000),
    ('item|cobblemon:fast_ball|1-2|Fast Ball', 6000),
    ('item|cobblemon:heavy_ball|1-2|Heavy Ball', 6000),
    ('item|cobblemon:moon_ball|1-2|Moon Ball', 6000),
    ('item|cobblemon:dusk_ball|1-2|Dusk Ball', 6000),
    ('item|cobblemon:level_ball|1-2|Level Ball', 6000),
    ('item|cobblemon:ancient_great_ball|1-2|Ancient Great Ball', 6000),
    ('item|cobblemon:ancient_leaden_ball|1-2|Ancient Leaden Ball', 6000),
    ('item|cobblemon:ancient_wing_ball|1-2|Ancient Wing Ball', 6000),
    ('item|cobblemon:super_potion|1|Super Potion', 6000),
    ('item|cobblemon:hyper_potion|1|Hyper Potion', 6000),
    ('item|cobblemon:full_heal|1|Full Heal', 6000),
    ('item|cobblemon:exp_candy_xs|1-4|EXP Candy XS', 6000),
    ('item|cobblemon:exp_candy_s|1-2|EXP Candy S', 6000),
    ('item|cobblemon:exp_candy_m|1|EXP Candy M', 6000),
    -- Rare (4 → 1200) — Max Potion / Full Restore omitted
    ('item|cobblemon:ultra_ball|2-4|Ultra Ball', 1200),
    ('item|cobblemon:dream_ball|1|Dream Ball', 1200),
    ('item|cobblemon:timer_ball|1|Timer Ball', 1200),
    ('item|cobblemon:quick_ball|1|Quick Ball', 1200),
    ('item|cobblemon:safari_ball|1|Safari Ball', 1200),
    ('item|cobblemon:beast_ball|1|Beast Ball', 1200),
    ('item|cobblemon:ancient_ultra_ball|1|Ancient Ultra Ball', 1200),
    ('item|cobblemon:ancient_jet_ball|1|Ancient Jet Ball', 1200),
    ('item|cobblemon:ancient_gigaton_ball|1|Ancient Gigaton Ball', 1200),
    ('item|cobblemon:revive|1|Revive', 1200),
    ('item|cobblemon:exp_candy_l|1|EXP Candy L', 1200),
    -- Very Rare
    ('item|cobblemon:cherish_ball|1|Cherish Ball', 200),
    ('item|cobblemon:max_revive|1|Max Revive', 200),
    ('item|cobblemon:ability_capsule|1|Ability Capsule', 120),
    ('item|cobblemon:ability_patch|1|Ability Patch', 50),
    ('item|obc:bottle_cap|1|Bottle Cap', 20),
    ('item|obc:bottle_cap_attack|1|Bottle Cap Attack', 10),
    ('item|obc:bottle_cap_special_attack|1|Bottle Cap Special Attack', 10),
    ('item|obc:bottle_cap_defence|1|Bottle Cap Defence', 10),
    ('item|obc:bottle_cap_special_defence|1|Bottle Cap Special Defence', 10),
    ('item|obc:bottle_cap_hp|1|Bottle Cap Health', 10),
    ('item|obc:bottle_cap_speed|1|Bottle Cap Speed', 10),
    ('item|mega_showdown:wishing_star|1|Wishing Star', 10),
    ('item|mega_showdown:sparkling_stone_dark|1|Sparkling Stone Dark', 10),
    ('item|mega_showdown:sparkling_stone_light|1|Sparkling Stone Light', 10),
    ('item|mega_showdown:blank_z|1|Blank Z', 10),
    ('item|mega_showdown:keystone|1|Keystone', 10),
    -- Super Rare
    ('item|cobblemon:master_ball|1|Master Ball', 2),
    ('item|cobblemon:ancient_origin_ball|1|Ancient Origin Ball', 1)
) AS v(reward_type, weight)
WHERE p.name = 'Ticket Wheel';
