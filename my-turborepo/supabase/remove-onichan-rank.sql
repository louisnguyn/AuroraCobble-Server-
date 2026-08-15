-- Remove Oniichan from the website shop ladder.
-- Active onichan display ranks become hero (next shop buy is Ultimate).
-- Owned onichan rows are deleted; lower shop ranks (hero and below) stay owned.
--
-- Run in the Supabase SQL Editor after deploying the backend without onichan.

BEGIN;

UPDATE users
SET minecraft_role = 'hero',
    updated_at = now()
WHERE lower(trim(minecraft_role)) = 'onichan';

DELETE FROM user_owned_roles
WHERE lower(trim(role_key)) = 'onichan';

COMMIT;

SELECT 'users still onichan' AS check, count(*) AS count
FROM users
WHERE lower(trim(minecraft_role)) = 'onichan'
UNION ALL
SELECT 'owned onichan rows', count(*)
FROM user_owned_roles
WHERE lower(trim(role_key)) = 'onichan';
