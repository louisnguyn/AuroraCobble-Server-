-- Staff audit log for Ranked Battle admin (ELO adjustments and feed review toggles).

CREATE TABLE IF NOT EXISTS ranked_battle_staff_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  staff_user_id bigint NOT NULL REFERENCES users (id),
  event_kind text NOT NULL CHECK (event_kind IN ('elo_add', 'elo_remove', 'feed_review')),
  minecraft_username text,
  elo_amount integer,
  elo_format text,
  elo_ok boolean,
  elo_error text,
  review_item_key text,
  review_feed_kind text,
  review_reviewed boolean,
  staff_reason text
);

CREATE INDEX IF NOT EXISTS ranked_battle_staff_events_created_idx ON ranked_battle_staff_events (created_at DESC);
