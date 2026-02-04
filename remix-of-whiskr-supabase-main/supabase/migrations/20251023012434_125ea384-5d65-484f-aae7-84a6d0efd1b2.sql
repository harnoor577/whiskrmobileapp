-- Add new role values to the enum
-- These must be in a separate transaction from their usage
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'vet';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'vet_tech';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'receptionist';