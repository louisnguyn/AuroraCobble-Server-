-- Run in Supabase SQL Editor.
-- Website tournament brackets (qualifying → QF with top 4 → SF → final + 3rd).

CREATE TABLE IF NOT EXISTS tournaments (
  id bigserial PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  subtitle text,
  prizes jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_published boolean NOT NULL DEFAULT false,
  /** 12 = qualifiers (seeds 5–12) + QF + SF + … ; 8 = single-elim starting at quarter-finals (1v8 … 4v5). */
  bracket_size smallint NOT NULL DEFAULT 12 CHECK (bracket_size IN (8, 12)),
  qf_qual_feed jsonb NOT NULL DEFAULT '[3, 2, 1, 0]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tournament_participants (
  id bigserial PRIMARY KEY,
  tournament_id bigint NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  seed_rank integer NOT NULL CHECK (seed_rank >= 1 AND seed_rank <= 12),
  display_name text NOT NULL,
  pokepaste_raw text,
  team_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, seed_rank)
);

CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament
  ON tournament_participants (tournament_id);

CREATE TABLE IF NOT EXISTS tournament_match_results (
  id bigserial PRIMARY KEY,
  tournament_id bigint NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  match_key text NOT NULL,
  winner_participant_id bigint REFERENCES tournament_participants(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, match_key)
);

CREATE INDEX IF NOT EXISTS idx_tournament_match_results_tournament
  ON tournament_match_results (tournament_id);
