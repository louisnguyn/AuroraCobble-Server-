-- Owned ranks (shop buy / claim / grant / VIP claim) + website VIP track.
-- Run in Supabase SQL Editor.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS website_vip_tier text NOT NULL DEFAULT 'player';

COMMENT ON COLUMN users.website_vip_tier IS
  'Website VIP overlay ladder key: player → vip → mvip → svip → uvip → zeus → legend → titan';

CREATE TABLE IF NOT EXISTS user_owned_roles (
  user_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role_key text NOT NULL,
  source text NOT NULL DEFAULT 'shop',
  acquired_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_key),
  CONSTRAINT user_owned_roles_source_check CHECK (
    source IN ('shop', 'grant', 'admin', 'vip_claim', 'backfill')
  )
);

CREATE INDEX IF NOT EXISTS user_owned_roles_user_idx ON user_owned_roles (user_id);

-- Backfill: current active minecraft_role + all lower shop ladder tiers.
-- Shop order must match Backend PURCHASABLE_ROLE_KEYS.
WITH shop AS (
  SELECT * FROM (VALUES
    (0, 'noob'),
    (1, 'elite'),
    (2, 'pro'),
    (3, 'master'),
    (4, 'hero'),
    (5, 'onichan'),
    (6, 'ultimate'),
    (7, 'overlord'),
    (8, 'god')
  ) AS t(idx, key)
),
legacy_equiv AS (
  SELECT u.id AS user_id,
    CASE lower(trim(u.minecraft_role))
      WHEN 'zeus' THEN 'pro'
      WHEN 'knight' THEN 'pro'
      WHEN 'legend' THEN 'ultimate'
      ELSE lower(trim(u.minecraft_role))
    END AS progress_key
  FROM users u
),
progress AS (
  SELECT le.user_id, coalesce(s.idx, -1) AS idx
  FROM legacy_equiv le
  LEFT JOIN shop s ON s.key = le.progress_key
)
INSERT INTO user_owned_roles (user_id, role_key, source)
SELECT p.user_id, s.key, 'backfill'
FROM progress p
JOIN shop s ON s.idx <= p.idx
WHERE p.idx >= 0
ON CONFLICT (user_id, role_key) DO NOTHING;

-- Also own the exact current role if it is any known non-member key.
INSERT INTO user_owned_roles (user_id, role_key, source)
SELECT u.id, lower(trim(u.minecraft_role)), 'backfill'
FROM users u
WHERE u.minecraft_role IS NOT NULL
  AND lower(trim(u.minecraft_role)) <> ''
  AND lower(trim(u.minecraft_role)) <> 'member'
ON CONFLICT (user_id, role_key) DO NOTHING;

COMMIT;
