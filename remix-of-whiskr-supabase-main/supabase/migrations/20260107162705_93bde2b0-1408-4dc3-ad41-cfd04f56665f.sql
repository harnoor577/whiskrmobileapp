-- Add name_prefix column to profiles table with default 'Dr.'
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS name_prefix TEXT DEFAULT 'Dr.';