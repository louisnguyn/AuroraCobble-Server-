-- Tournament prediction (website Cobble$): admin picks active tournament + lock time + max stake.
-- Results settle when the tournament final winner is set in the bracket.

CREATE TABLE IF NOT EXISTS tournament_prediction_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  tournament_id bigint REFERENCES tournaments(id) ON DELETE SET NULL,
  predictions_locked_at timestamptz,
  max_stake integer NOT NULL DEFAULT 20000,
  min_stake integer NOT NULL DEFAULT 100,
  champion_win_multiplier numeric NOT NULL DEFAULT 2,
  runner_up_win_multiplier numeric NOT NULL DEFAULT 2,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO tournament_prediction_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS tournament_predictions (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tournament_id bigint NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  stake_champion integer NOT NULL DEFAULT 0,
  pick_champion_participant_id bigint REFERENCES tournament_participants(id) ON DELETE SET NULL,
  stake_runner_up integer NOT NULL DEFAULT 0,
  pick_runner_up_participant_id bigint REFERENCES tournament_participants(id) ON DELETE SET NULL,
  result_champion text NOT NULL DEFAULT 'pending'
    CHECK (result_champion IN ('pending', 'won', 'lost', 'skipped')),
  result_runner_up text NOT NULL DEFAULT 'pending'
    CHECK (result_runner_up IN ('pending', 'won', 'lost', 'skipped')),
  payout_champion integer,
  payout_runner_up integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT tournament_predictions_stakes_non_negative CHECK (stake_champion >= 0 AND stake_runner_up >= 0),
  CONSTRAINT tournament_predictions_total_stake_positive CHECK (stake_champion + stake_runner_up > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tournament_predictions_user_tournament
  ON tournament_predictions (user_id, tournament_id);

CREATE INDEX IF NOT EXISTS idx_tournament_predictions_resolve
  ON tournament_predictions (tournament_id, result_champion, result_runner_up);
