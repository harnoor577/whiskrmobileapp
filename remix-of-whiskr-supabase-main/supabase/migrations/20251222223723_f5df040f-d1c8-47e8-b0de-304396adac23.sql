-- Add payment_failed_at column to track when payment first failed (for grace period tracking)
ALTER TABLE public.clinics 
ADD COLUMN IF NOT EXISTS payment_failed_at timestamp with time zone DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.clinics.payment_failed_at IS 'Timestamp of first payment failure in current grace period, cleared on successful payment';