-- Add DELETE policies for consultations
CREATE POLICY "Vets and admins can delete consults"
ON public.consults
FOR DELETE
USING (
  clinic_id IN (
    SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()
  )
  AND (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'veterinarian'::app_role)
  )
);

-- Add DELETE policy for chat messages
CREATE POLICY "Users can delete chat messages in their clinic"
ON public.chat_messages
FOR DELETE
USING (
  clinic_id IN (
    SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()
  )
);