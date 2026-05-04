-- Pokémon blacklist (separate from restricted list). Run if battle_restrictions_config already exists.

ALTER TABLE battle_restrictions_config
  ADD COLUMN IF NOT EXISTS pokemon_blacklist_slugs text[] NOT NULL DEFAULT '{}';

ALTER TABLE battle_restrictions_config
  ADD COLUMN IF NOT EXISTS pokemon_blacklist_notes_html text NOT NULL DEFAULT '';
