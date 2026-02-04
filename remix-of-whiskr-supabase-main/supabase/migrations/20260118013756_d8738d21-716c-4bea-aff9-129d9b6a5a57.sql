-- Backfill user_email and user_name from profiles using created_by
UPDATE consult_history ch
SET user_email = p.email,
    user_name = p.name
FROM profiles p
WHERE p.user_id = ch.created_by
  AND ch.user_email IS NULL;