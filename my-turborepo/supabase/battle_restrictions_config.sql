-- Public battle/restrictions copy edited from Admin (TipTap + curated pick lists).
-- Run in Supabase SQL Editor after other migrations.

CREATE TABLE IF NOT EXISTS battle_restrictions_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  updated_at timestamptz NOT NULL DEFAULT now (),
  format_label text NOT NULL DEFAULT '',
  player_restrictions_html text NOT NULL DEFAULT '',
  pokemon_slugs text[] NOT NULL DEFAULT '{}',
  pokemon_notes_html text NOT NULL DEFAULT '',
  move_slugs text[] NOT NULL DEFAULT '{}',
  move_notes_html text NOT NULL DEFAULT '',
  ability_slugs text[] NOT NULL DEFAULT '{}',
  ability_notes_html text NOT NULL DEFAULT '',
  item_slugs text[] NOT NULL DEFAULT '{}',
  item_notes_html text NOT NULL DEFAULT ''
);

INSERT INTO battle_restrictions_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
