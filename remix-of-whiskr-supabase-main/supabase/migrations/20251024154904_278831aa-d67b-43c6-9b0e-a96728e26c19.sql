-- Add assignment functionality for support agents
-- Add assigned_to column if it doesn't already exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'support_tickets' 
    AND column_name = 'assigned_to'
  ) THEN
    ALTER TABLE public.support_tickets 
    ADD COLUMN assigned_to uuid REFERENCES auth.users(id);
  END IF;
END $$;

-- Create index for assigned_to for faster lookups
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_to 
ON public.support_tickets(assigned_to);

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Support agents can view assigned tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Support agents can update assigned tickets" ON public.support_tickets;

-- Create policy to allow support agents to view tickets assigned to them or all tickets if they're a support agent
CREATE POLICY "Support agents can view assigned tickets"
ON public.support_tickets
FOR SELECT
TO authenticated
USING (
  assigned_to = auth.uid() 
  OR EXISTS (
    SELECT 1 FROM public.support_agents
    WHERE support_agents.user_id = auth.uid()
  )
);

-- Allow support agents to update tickets assigned to them or all tickets if they're a support agent
CREATE POLICY "Support agents can update assigned tickets"
ON public.support_tickets
FOR UPDATE
TO authenticated
USING (
  assigned_to = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.support_agents
    WHERE support_agents.user_id = auth.uid()
  )
  OR has_role(auth.uid(), 'super_admin'::app_role)
);