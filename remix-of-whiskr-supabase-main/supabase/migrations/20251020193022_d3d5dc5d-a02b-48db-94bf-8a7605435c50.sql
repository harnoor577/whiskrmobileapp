-- Update existing non-admin roles to 'standard'
UPDATE user_roles 
SET role = 'standard'::app_role
WHERE role NOT IN ('admin', 'super_admin');

-- Add a comment to document the simplified role structure
COMMENT ON TYPE app_role IS 'Simplified roles: admin (full access), standard (no admin settings), super_admin (master admin)';