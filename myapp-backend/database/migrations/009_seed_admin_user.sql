BEGIN;

UPDATE users
SET role = 'ADMIN',
    status = 'ACTIVE',
    password_hash = '$2b$12$tvEUuxSnv/seasrmZFkppuQZNYNCr1zhj1tpU4E.q01jZU2dUvi5q',
    password = COALESCE(password, '$2b$12$tvEUuxSnv/seasrmZFkppuQZNYNCr1zhj1tpU4E.q01jZU2dUvi5q'),
    updated_at = CURRENT_TIMESTAMP
WHERE email = 'admin@375scores.local';

INSERT INTO users (
    email,
    username,
    password,
    password_hash,
    first_name,
    last_name,
    role,
    status,
    email_verified_at
)
SELECT
    'admin@375scores.local',
    CASE
        WHEN EXISTS (SELECT 1 FROM users WHERE username = 'admin') THEN 'admin_375scores'
        ELSE 'admin'
    END,
    '$2b$12$tvEUuxSnv/seasrmZFkppuQZNYNCr1zhj1tpU4E.q01jZU2dUvi5q',
    '$2b$12$tvEUuxSnv/seasrmZFkppuQZNYNCr1zhj1tpU4E.q01jZU2dUvi5q',
    'Admin',
    'User',
    'ADMIN',
    'ACTIVE',
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1
    FROM users
    WHERE email = 'admin@375scores.local'
);

COMMIT;
