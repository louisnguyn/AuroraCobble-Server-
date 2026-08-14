-- Staff-defined achievements and per-user grants (shown on public profile).

CREATE TABLE IF NOT EXISTS profile_achievement_definitions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL,
  tier text NOT NULL CHECK (
    tier IN (
      'silver',
      'cyan',
      'emerald',
      'violet',
      'rose',
      'gold',
      'mythic',
      'legend'
    )
  ),
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_achievement_definitions_title_len CHECK (length(title) <= 120),
  CONSTRAINT profile_achievement_definitions_desc_len CHECK (length(description) <= 600),
  CONSTRAINT profile_achievement_definitions_slug_len CHECK (length(slug) <= 48)
);

CREATE TABLE IF NOT EXISTS profile_achievement_grants (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  achievement_id bigint NOT NULL REFERENCES profile_achievement_definitions (id) ON DELETE CASCADE,
  granted_by bigint REFERENCES users (id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now (),
  UNIQUE (user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS profile_achievement_grants_user_idx ON profile_achievement_grants (user_id);
CREATE INDEX IF NOT EXISTS profile_achievement_grants_achievement_idx ON profile_achievement_grants (achievement_id);
