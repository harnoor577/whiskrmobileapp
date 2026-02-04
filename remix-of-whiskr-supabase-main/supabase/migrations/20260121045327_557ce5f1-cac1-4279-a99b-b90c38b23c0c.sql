-- 1. Drop the dependent view first
DROP VIEW IF EXISTS consult_complete_view;

-- 2. Drop redundant vet columns from consult_history table
ALTER TABLE consult_history
  DROP COLUMN IF EXISTS vet_user_id,
  DROP COLUMN IF EXISTS vet_name,
  DROP COLUMN IF EXISTS vet_email;

-- 3. Backfill existing records with null user_name/user_email
UPDATE consult_history ch
SET user_email = p.email,
    user_name = p.name
FROM profiles p
WHERE p.user_id = ch.created_by
  AND (ch.user_email IS NULL OR ch.user_name IS NULL);