-- Clan system (website Cobble$). Run once in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS clans (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  bio text,
  avatar_url text NOT NULL,
  leader_id bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  bank_balance bigint NOT NULL DEFAULT 0 CHECK (bank_balance >= 0),
  total_donated bigint NOT NULL DEFAULT 0 CHECK (total_donated >= 0), -- deprecated: milestones use bank_balance
  last_daily_income_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clans_name_lower ON clans (lower(trim(name)));

CREATE TABLE IF NOT EXISTS clan_members (
  clan_id bigint NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('leader', 'member')),
  donated_total bigint NOT NULL DEFAULT 0 CHECK (donated_total >= 0),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id)
);

CREATE INDEX IF NOT EXISTS idx_clan_members_clan ON clan_members (clan_id);

CREATE TABLE IF NOT EXISTS clan_join_requests (
  id bigserial PRIMARY KEY,
  clan_id bigint NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  requester_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clan_join_requests_pending_unique
  ON clan_join_requests (clan_id, requester_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_clan_join_requests_clan_pending
  ON clan_join_requests (clan_id)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS clan_donations (
  id bigserial PRIMARY KEY,
  clan_id bigint NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount bigint NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clan_donations_clan ON clan_donations (clan_id, created_at DESC);

CREATE TABLE IF NOT EXISTS clan_disbursements (
  id bigserial PRIMARY KEY,
  clan_id bigint NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  leader_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount bigint NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clan_disbursements_clan ON clan_disbursements (clan_id, created_at DESC);
