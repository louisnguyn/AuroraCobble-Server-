-- Run in Supabase SQL Editor: tracks daily online streak + last seen for Minecraft dashboard.
-- Streak = consecutive UTC calendar days with at least one "online" snapshot when admin loads the dashboard.

CREATE TABLE IF NOT EXISTS minecraft_player_presence (
  player_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  last_seen_online TIMESTAMPTZ,
  streak_days INT NOT NULL DEFAULT 0,
  streak_last_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_minecraft_presence_updated ON minecraft_player_presence (updated_at DESC);

COMMENT ON TABLE minecraft_player_presence IS 'Minecraft IGN presence for admin streak/offline stats (updated on /admin/minecraft/dashboard)';
