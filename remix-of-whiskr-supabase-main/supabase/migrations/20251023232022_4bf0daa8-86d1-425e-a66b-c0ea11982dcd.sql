-- Create feedback table for AI-generated content
CREATE TABLE IF NOT EXISTS public.ai_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  consult_id UUID REFERENCES public.consults(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('diagnosis', 'treatment_plan', 'soap_note')),
  content_text TEXT NOT NULL,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('positive', 'negative')),
  feedback_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create support tickets table
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved', 'closed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  assigned_to UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- Create support ticket replies table
CREATE TABLE IF NOT EXISTS public.support_ticket_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  message TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create support agents table
CREATE TABLE IF NOT EXISTS public.support_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  added_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_agents ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ai_feedback
CREATE POLICY "Users can submit feedback in their clinic"
  ON public.ai_feedback FOR INSERT
  WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid())
    AND user_id = auth.uid()
  );

CREATE POLICY "Users can view their own feedback"
  ON public.ai_feedback FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Super admins can view all feedback"
  ON public.ai_feedback FOR SELECT
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can update feedback"
  ON public.ai_feedback FOR UPDATE
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- RLS Policies for support_tickets
CREATE POLICY "Users can create tickets in their clinic"
  ON public.support_tickets FOR INSERT
  WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid())
    AND user_id = auth.uid()
  );

CREATE POLICY "Users can view their own tickets"
  ON public.support_tickets FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Super admins can view all tickets"
  ON public.support_tickets FOR SELECT
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Support agents can view all tickets"
  ON public.support_tickets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.support_agents WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Super admins can update tickets"
  ON public.support_tickets FOR UPDATE
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Support agents can update tickets"
  ON public.support_tickets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.support_agents WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for support_ticket_replies
CREATE POLICY "Users can reply to their tickets"
  ON public.support_ticket_replies FOR INSERT
  WITH CHECK (
    ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = auth.uid())
  );

CREATE POLICY "Support agents can reply to tickets"
  ON public.support_ticket_replies FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.support_agents WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can view replies to their tickets"
  ON public.support_ticket_replies FOR SELECT
  USING (
    ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = auth.uid())
    AND NOT is_internal
  );

CREATE POLICY "Super admins can view all replies"
  ON public.support_ticket_replies FOR SELECT
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Support agents can view all replies"
  ON public.support_ticket_replies FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.support_agents WHERE user_id = auth.uid())
  );

-- RLS Policies for support_agents
CREATE POLICY "Super admins can manage support agents"
  ON public.support_agents FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Support agents can view themselves"
  ON public.support_agents FOR SELECT
  USING (user_id = auth.uid());

-- Create indexes for performance
CREATE INDEX idx_ai_feedback_clinic ON public.ai_feedback(clinic_id);
CREATE INDEX idx_ai_feedback_status ON public.ai_feedback(status);
CREATE INDEX idx_ai_feedback_user ON public.ai_feedback(user_id);
CREATE INDEX idx_support_tickets_clinic ON public.support_tickets(clinic_id);
CREATE INDEX idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX idx_support_tickets_user ON public.support_tickets(user_id);
CREATE INDEX idx_support_ticket_replies_ticket ON public.support_ticket_replies(ticket_id);

-- Trigger to update updated_at
CREATE TRIGGER update_ai_feedback_updated_at
  BEFORE UPDATE ON public.ai_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();