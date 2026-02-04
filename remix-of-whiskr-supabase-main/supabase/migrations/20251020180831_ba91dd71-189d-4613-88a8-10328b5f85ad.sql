-- Add front_reception and vet_tech roles to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'front_reception';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vet_tech';