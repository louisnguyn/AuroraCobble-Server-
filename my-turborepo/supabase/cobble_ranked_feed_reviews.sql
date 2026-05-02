-- Staff "reviewed" flags for CobbleRanked match results / battle replays (admin dashboard).

CREATE TABLE IF NOT EXISTS cobble_ranked_feed_reviews (
  item_key text PRIMARY KEY,
  feed_kind text NOT NULL CHECK (feed_kind IN ('match_result', 'battle_replay')),
  reviewed boolean NOT NULL DEFAULT true,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by_user_id bigint REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_cobble_ranked_feed_reviews_kind ON cobble_ranked_feed_reviews (feed_kind);
