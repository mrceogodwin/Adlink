-- Public publisher profile images for the homepage audience strip.
ALTER TABLE publisher_profiles
  ADD COLUMN IF NOT EXISTS profile_image_url text;

ALTER TABLE publisher_profiles
  ADD CONSTRAINT publisher_profiles_profile_image_url_https
  CHECK (
    profile_image_url IS NULL
    OR profile_image_url = ''
    OR profile_image_url ~ '^https://[^[:space:]]+$'
  );
