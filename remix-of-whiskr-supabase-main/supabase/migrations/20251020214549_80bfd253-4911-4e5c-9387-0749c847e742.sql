-- Add lifetime credit limit tracking to user_credits
ALTER TABLE public.user_credits ADD COLUMN IF NOT EXISTS lifetime_total numeric DEFAULT 0;

-- Create a function to get total credits per user
CREATE OR REPLACE FUNCTION public.get_user_total_credits(user_uuid uuid)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(SUM(amount), 0) FROM public.user_credits WHERE user_id = user_uuid;
$$;

-- Add constraint to prevent multiple referral codes per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_referral_code_per_user ON public.referral_codes(user_id);