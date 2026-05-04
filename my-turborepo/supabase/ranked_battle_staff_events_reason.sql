-- Optional reason for staff actions (ELO adjustments). Run if `ranked_battle_staff_events` already exists.

ALTER TABLE ranked_battle_staff_events
  ADD COLUMN IF NOT EXISTS staff_reason text;
