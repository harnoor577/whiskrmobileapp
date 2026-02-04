-- Add refund_status column to support_tickets
ALTER TABLE public.support_tickets 
ADD COLUMN IF NOT EXISTS refund_status text CHECK (refund_status IN ('under_review', 'approved', 'declined', 'processed'));

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_support_tickets_refund_status ON public.support_tickets(refund_status) WHERE refund_status IS NOT NULL;