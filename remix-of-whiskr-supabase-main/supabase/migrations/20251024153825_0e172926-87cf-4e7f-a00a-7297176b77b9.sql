-- Fix RLS policy for support_ticket_replies to allow all users to reply to their tickets
-- and support agents/super admins to reply to any ticket

-- Drop existing policies
DROP POLICY IF EXISTS "Users can reply to their tickets" ON public.support_ticket_replies;
DROP POLICY IF EXISTS "Support agents can reply to tickets" ON public.support_ticket_replies;

-- Create new comprehensive policy for inserting replies
CREATE POLICY "Users and support can create replies" 
ON public.support_ticket_replies 
FOR INSERT 
WITH CHECK (
  -- User can reply to their own tickets
  (ticket_id IN (
    SELECT id FROM public.support_tickets WHERE user_id = auth.uid()
  ))
  OR
  -- Support agents can reply to any ticket
  (EXISTS (
    SELECT 1 FROM public.support_agents WHERE user_id = auth.uid()
  ))
  OR
  -- Super admins can reply to any ticket
  has_role(auth.uid(), 'super_admin'::app_role)
);

-- Add RLS policy for deleting support agents
CREATE POLICY "Super admins can delete support agents"
ON public.support_agents
FOR DELETE
USING (has_role(auth.uid(), 'super_admin'::app_role));