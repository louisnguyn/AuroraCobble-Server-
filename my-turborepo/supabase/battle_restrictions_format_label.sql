-- Optional battle format line (shown under “Restrictions” on the site). Run if the table already exists.

ALTER TABLE battle_restrictions_config
  ADD COLUMN IF NOT EXISTS format_label text NOT NULL DEFAULT '';
