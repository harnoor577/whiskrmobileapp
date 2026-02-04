-- Add inviter_name to referrals table for display on landing page
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS inviter_name text;

-- Update referral_codes to store inviter name for easy lookup
ALTER TABLE public.referral_codes ADD COLUMN IF NOT EXISTS inviter_name text;