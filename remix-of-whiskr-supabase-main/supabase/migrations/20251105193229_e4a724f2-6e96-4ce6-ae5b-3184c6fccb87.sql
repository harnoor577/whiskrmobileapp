-- Add category and tags fields to support_tickets
ALTER TABLE public.support_tickets 
ADD COLUMN IF NOT EXISTS category text,
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS payload jsonb DEFAULT '{}'::jsonb;

-- Add index for category
CREATE INDEX IF NOT EXISTS idx_support_tickets_category ON public.support_tickets(category);

-- Add index for tags using GIN
CREATE INDEX IF NOT EXISTS idx_support_tickets_tags ON public.support_tickets USING GIN(tags);

-- Create support_ticket_reads table if it doesn't exist for unread tracking
CREATE TABLE IF NOT EXISTS public.support_ticket_reads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  last_read_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(ticket_id, user_id)
);

-- Enable RLS on support_ticket_reads
ALTER TABLE public.support_ticket_reads ENABLE ROW LEVEL SECURITY;

-- RLS policies for support_ticket_reads
CREATE POLICY "Users can view their own read status"
  ON public.support_ticket_reads
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own read status"
  ON public.support_ticket_reads
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their read timestamps"
  ON public.support_ticket_reads
  FOR UPDATE
  USING (user_id = auth.uid());

-- Add trigger to update updated_at
CREATE OR REPLACE TRIGGER update_support_ticket_reads_updated_at
BEFORE UPDATE ON public.support_ticket_reads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();