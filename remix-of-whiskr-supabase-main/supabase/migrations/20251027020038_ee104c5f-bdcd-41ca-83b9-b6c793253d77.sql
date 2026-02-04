-- Add onboarding fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS user_type text CHECK (user_type IN ('dvm', 'student')),
ADD COLUMN IF NOT EXISTS school_name text,
ADD COLUMN IF NOT EXISTS country text,
ADD COLUMN IF NOT EXISTS state_province text,
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS dvm_role text CHECK (dvm_role IN ('associate', 'practice_owner', 'relief_locum', 'academia')),
ADD COLUMN IF NOT EXISTS practice_types text[],
ADD COLUMN IF NOT EXISTS user_tags text[];

-- Create index for faster tag-based queries
CREATE INDEX IF NOT EXISTS idx_profiles_user_tags ON public.profiles USING GIN(user_tags);
CREATE INDEX IF NOT EXISTS idx_profiles_user_type ON public.profiles(user_type);
CREATE INDEX IF NOT EXISTS idx_profiles_country ON public.profiles(country);