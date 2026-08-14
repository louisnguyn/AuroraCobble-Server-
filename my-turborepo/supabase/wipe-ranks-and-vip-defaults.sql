-- Reset ALL accounts to default rank + VIP inventory.
-- Rank display: member
-- VIP track: player
-- Clears user_owned_roles (member/player still appear in inventory as built-in defaults).
--
-- Run in Supabase SQL Editor. Does NOT change LuckPerms on the Minecraft server —
-- players (or staff) must re-apply display / re-run LP if in-game prefixes are stale.
--
-- Optional: after this, have players open Inventory → Display "member",
-- or batch `lp user <name> parent set member` on the game server.

BEGIN;

UPDATE users
SET
  minecraft_role = 'member',
  website_vip_tier = 'player',
  updated_at = now()
WHERE minecraft_role IS DISTINCT FROM 'member'
   OR website_vip_tier IS DISTINCT FROM 'player'
   OR website_vip_tier IS NULL;

-- Drop every owned shop/VIP/grant row.
DELETE FROM user_owned_roles;

COMMIT;

-- Sanity check
SELECT
  count(*) FILTER (WHERE minecraft_role <> 'member') AS non_member_roles,
  count(*) FILTER (
    WHERE coalesce(website_vip_tier, '') <> 'player'
  ) AS non_player_vip,
  (SELECT count(*) FROM user_owned_roles) AS owned_rows_left
FROM users;
