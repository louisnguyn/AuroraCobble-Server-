-- Allow logging "delete all match feed" in ranked battle staff history.

ALTER TABLE ranked_battle_staff_events DROP CONSTRAINT IF EXISTS ranked_battle_staff_events_event_kind_check;
ALTER TABLE ranked_battle_staff_events ADD CONSTRAINT ranked_battle_staff_events_event_kind_check
  CHECK (event_kind IN ('elo_add', 'elo_remove', 'feed_review', 'feed_clear'));
