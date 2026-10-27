-- Expand the owner-only role while keeping role assignment server-controlled.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('advertiser','publisher','admin','super_admin'));
