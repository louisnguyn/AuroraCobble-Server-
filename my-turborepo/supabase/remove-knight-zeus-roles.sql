-- Remove deprecated knight (request) and zeus (VIP) from website ownership.
-- Run in Supabase SQL Editor after deploying the code that drops these tiers.
--
-- zeus VIP → treated as legend (owned row rewritten if present)
-- knight → deleted from inventory (no longer grantable)

BEGIN;

-- VIP track: anyone marked zeus becomes legend
UPDATE users
SET website_vip_tier = 'legend', updated_at = now()
WHERE lower(trim(website_vip_tier)) = 'zeus';

-- Inventory: convert zeus → legend (keep ownership)
INSERT INTO user_owned_roles (user_id, role_key, source)
SELECT user_id, 'legend', coalesce(source, 'backfill')
FROM user_owned_roles
WHERE lower(trim(role_key)) = 'zeus'
ON CONFLICT (user_id, role_key) DO NOTHING;

DELETE FROM user_owned_roles
WHERE lower(trim(role_key)) IN ('zeus', 'knight');

-- If someone still has these as active display, fall back to member
UPDATE users
SET minecraft_role = 'member', updated_at = now()
WHERE lower(trim(minecraft_role)) IN ('zeus', 'knight');

COMMIT;

SELECT website_vip_tier, count(*) FROM users GROUP BY 1 ORDER BY 1;
SELECT role_key, count(*) FROM user_owned_roles GROUP BY 1 ORDER BY 1;
