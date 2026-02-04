-- 1) Create support_ticket_reads to track per-user read state
CREATE TABLE IF NOT EXISTS public.support_ticket_reads (
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, user_id)
);

ALTER TABLE public.support_ticket_reads ENABLE ROW LEVEL SECURITY;

-- Users can manage their own read state
CREATE POLICY "Users can manage their support ticket reads"
ON public.support_ticket_reads
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 2) Trigger to create notifications when support replies are added
CREATE OR REPLACE FUNCTION public.notify_support_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ticket_record public.support_tickets%ROWTYPE;
BEGIN
  -- Only notify when reply is from support (not the user themselves)
  IF NEW.is_support_reply THEN
    SELECT * INTO ticket_record FROM public.support_tickets WHERE id = NEW.ticket_id;
    IF ticket_record.user_id IS NOT NULL AND ticket_record.user_id <> NEW.user_id THEN
      INSERT INTO public.notifications (
        user_id,
        clinic_id,
        type,
        priority,
        title,
        description,
        action_url,
        consult_id
      ) VALUES (
        ticket_record.user_id,
        ticket_record.clinic_id,
        'support',
        'high',
        'Support Reply Received',
        'A support agent replied to your ticket: ' || ticket_record.subject,
        '/support',
        NULL
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_support_reply ON public.support_ticket_replies;
CREATE TRIGGER trg_notify_support_reply
AFTER INSERT ON public.support_ticket_replies
FOR EACH ROW
EXECUTE FUNCTION public.notify_support_reply();

-- 3) Enable realtime for support_ticket_replies and support_ticket_reads
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_replies;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_reads;