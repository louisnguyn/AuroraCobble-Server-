-- Rename website wallet currency_type: cobbledollars → asterynpoints
-- (Display name is already "Asteryn Point". In-game Minecraft Cobble$ is unchanged.)
--
-- Run in Supabase SQL Editor BEFORE or together with deploying the new Backend.
-- Safe to re-run (idempotent).

BEGIN;

-- Merge if somehow both keys exist for the same user (keep sum, drop legacy row).
WITH dupes AS (
  SELECT
    a.user_id,
    a.id AS keep_id,
    b.id AS drop_id,
    a.balance AS keep_bal,
    b.balance AS drop_bal
  FROM user_currency a
  JOIN user_currency b
    ON a.user_id = b.user_id
   AND a.currency_type = 'asterynpoints'
   AND b.currency_type = 'cobbledollars'
)
UPDATE user_currency u
SET balance = d.keep_bal + d.drop_bal,
    updated_at = now()
FROM dupes d
WHERE u.id = d.keep_id;

DELETE FROM user_currency b
USING user_currency a
WHERE a.user_id = b.user_id
  AND a.currency_type = 'asterynpoints'
  AND b.currency_type = 'cobbledollars';

-- Rename remaining legacy wallets.
UPDATE user_currency
SET currency_type = 'asterynpoints',
    updated_at = now()
WHERE currency_type = 'cobbledollars';

COMMIT;

-- Verify
SELECT currency_type, count(*) AS wallets, coalesce(sum(balance), 0) AS total
FROM user_currency
WHERE currency_type IN ('cobbledollars', 'asterynpoints')
GROUP BY currency_type
ORDER BY currency_type;
-- Expect only `asterynpoints` (or empty if no wallets yet).
