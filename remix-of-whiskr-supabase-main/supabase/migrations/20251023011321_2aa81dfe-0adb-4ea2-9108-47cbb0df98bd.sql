-- Update the user role from 'standard' to 'veterinarian'
UPDATE user_roles 
SET role = 'veterinarian'::app_role
WHERE user_id = '4bad47b2-f166-4a25-b231-bdd00b655748' 
  AND role = 'standard'::app_role;