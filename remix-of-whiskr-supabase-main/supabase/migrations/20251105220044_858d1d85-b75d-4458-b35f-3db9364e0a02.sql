-- First, check if there's a unique constraint on profiles.user_id
-- If so, we need to drop it and create a composite unique constraint on (user_id, clinic_id)

-- Drop the unique constraint on user_id if it exists
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'profiles_user_id_key'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_user_id_key;
  END IF;
END $$;

-- Add composite unique constraint on (user_id, clinic_id) if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'profiles_user_id_clinic_id_key'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_clinic_id_key UNIQUE (user_id, clinic_id);
  END IF;
END $$;

-- Add accepted_at column to user_invitations if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_invitations' 
    AND column_name = 'accepted_at'
    AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.user_invitations 
    ADD COLUMN accepted_at timestamp with time zone;
  END IF;
END $$;