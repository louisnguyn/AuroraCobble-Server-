-- Website users mapped to CobbleRanked PvP rank (from /leaderboard payload).

CREATE TABLE IF NOT EXISTS user_pvp_ranks (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  minecraft_username text NOT NULL,
  format_key text NOT NULL DEFAULT 'singles',
  rank_position integer NOT NULL,
  elo integer NULL,
  matches_played integer NULL,
  source_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_pvp_ranks_user_id
  ON user_pvp_ranks (user_id);

CREATE INDEX IF NOT EXISTS idx_user_pvp_ranks_rank
  ON user_pvp_ranks (rank_position);

ALTER TABLE user_pvp_ranks ADD COLUMN IF NOT EXISTS matches_played integer NULL;
