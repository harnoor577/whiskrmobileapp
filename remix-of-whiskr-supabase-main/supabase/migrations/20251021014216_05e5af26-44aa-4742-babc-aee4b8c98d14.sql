-- Create messages table for team communication
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  -- Add constraint to prevent empty messages
  CONSTRAINT content_not_empty CHECK (length(trim(content)) > 0)
);

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Policies for messages
CREATE POLICY "Users can view messages in their clinic"
  ON public.messages
  FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()
    )
    AND (sender_id = auth.uid() OR recipient_id = auth.uid() OR recipient_id IS NULL)
  );

CREATE POLICY "Users can send messages in their clinic"
  ON public.messages
  FOR INSERT
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()
    )
    AND sender_id = auth.uid()
  );

CREATE POLICY "Users can mark their messages as read"
  ON public.messages
  FOR UPDATE
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- Add indexes for performance
CREATE INDEX idx_messages_clinic_id ON public.messages(clinic_id);
CREATE INDEX idx_messages_sender_id ON public.messages(sender_id);
CREATE INDEX idx_messages_recipient_id ON public.messages(recipient_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);

-- Add trigger for updated_at
CREATE TRIGGER update_messages_updated_at
  BEFORE UPDATE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();