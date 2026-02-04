-- Add RLS policies for support agents to view consults and patients when there's an open ticket

-- Support agents can view consults for clinics with open support tickets
CREATE POLICY "Support agents can view consults for clinics with open tickets"
ON public.consults
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.support_agents sa
    WHERE sa.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.support_tickets st
    WHERE st.clinic_id = consults.clinic_id
      AND st.status IN ('open', 'in_progress')
  )
);

-- Support agents can view patients for clinics with open support tickets
CREATE POLICY "Support agents can view patients for clinics with open tickets"
ON public.patients
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.support_agents sa
    WHERE sa.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.support_tickets st
    WHERE st.clinic_id = patients.clinic_id
      AND st.status IN ('open', 'in_progress')
  )
);

-- Support agents can view chat messages for consults in clinics with open tickets
CREATE POLICY "Support agents can view chat messages for clinics with open tickets"
ON public.chat_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.support_agents sa
    WHERE sa.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.support_tickets st
    JOIN public.consults c ON c.clinic_id = st.clinic_id
    WHERE st.status IN ('open', 'in_progress')
      AND c.id = chat_messages.consult_id
  )
);