-- Optional public profile fields (bio, avatar URL). Linked 1:1 to users.

CREATE TABLE IF NOT EXISTS user_public_profiles (
  user_id bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bio text,
  avatar_url text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_public_profiles_bio_len CHECK (bio IS NULL OR length(bio) <= 800),
  CONSTRAINT user_public_profiles_avatar_len CHECK (avatar_url IS NULL OR length(avatar_url) <= 2000)
);
