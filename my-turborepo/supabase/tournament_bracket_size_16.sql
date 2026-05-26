-- Allow 16-player brackets (run in Supabase SQL Editor after tournament_bracket_size.sql).

ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_bracket_size_check;

ALTER TABLE tournaments
  ADD CONSTRAINT tournaments_bracket_size_check CHECK (bracket_size IN (8, 12, 16));
