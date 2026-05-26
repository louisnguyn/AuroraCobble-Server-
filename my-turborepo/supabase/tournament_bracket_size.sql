-- Run in Supabase SQL Editor if `tournaments` already exists without this column.

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS bracket_size smallint NOT NULL DEFAULT 12;

ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_bracket_size_check;

ALTER TABLE tournaments
  ADD CONSTRAINT tournaments_bracket_size_check CHECK (bracket_size IN (8, 12, 16));

UPDATE tournaments SET bracket_size = 12 WHERE bracket_size IS NULL OR bracket_size NOT IN (8, 12, 16);
