-- Tracks battle pass LuckPerms grants/revokes from the admin UI (mirrors server after successful RCON).

CREATE TABLE IF NOT EXISTS battlepass_lp_grants (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  minecraft_username text NOT NULL,
  minecraft_username_normalized text GENERATED ALWAYS AS (lower(trim(minecraft_username))) STORED,
  kind text NOT NULL CHECK (kind IN ('premium', 'party')),
  active boolean NOT NULL DEFAULT true,
  website_user_id bigint REFERENCES users (id) ON DELETE SET NULL,
  granted_by_user_id bigint REFERENCES users (id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (minecraft_username_normalized, kind)
);

CREATE INDEX IF NOT EXISTS battlepass_lp_grants_kind_active_idx ON battlepass_lp_grants (kind)
WHERE
  active = true;
