-- ============================================================================
-- REMAINING RLS POLICIES
-- ============================================================================

-- Chat messages policies
CREATE POLICY "Users can view chat messages in their clinic" ON public.chat_messages
  FOR SELECT USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can create chat messages" ON public.chat_messages
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete chat messages in their clinic" ON public.chat_messages
  FOR DELETE USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Super admins can view all chat messages" ON public.chat_messages
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Support agents can view only ticket-related chat messages" ON public.chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM support_agents sa
      JOIN support_tickets st ON st.related_consult_id IS NOT NULL
      WHERE sa.user_id = auth.uid()
        AND st.related_consult_id = chat_messages.consult_id
        AND st.status IN ('open', 'in_progress')
    )
  );

-- AI feedback policies
CREATE POLICY "Users can view their own feedback" ON public.ai_feedback
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can submit feedback in their clinic" ON public.ai_feedback
  FOR INSERT WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()) AND
    user_id = auth.uid()
  );

CREATE POLICY "Super admins can view all feedback" ON public.ai_feedback
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can update feedback" ON public.ai_feedback
  FOR UPDATE USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Support tickets policies
CREATE POLICY "Users can view their own tickets" ON public.support_tickets
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create tickets in their clinic" ON public.support_tickets
  FOR INSERT WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()) AND
    user_id = auth.uid()
  );

CREATE POLICY "Support agents can view all tickets" ON public.support_tickets
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.support_agents WHERE user_id = auth.uid())
  );

CREATE POLICY "Support agents can view assigned tickets" ON public.support_tickets
  FOR SELECT USING (
    assigned_to = auth.uid() OR
    EXISTS (SELECT 1 FROM public.support_agents WHERE user_id = auth.uid())
  );

CREATE POLICY "Support agents can update tickets" ON public.support_tickets
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.support_agents WHERE user_id = auth.uid())
  );

CREATE POLICY "Support agents can update assigned tickets" ON public.support_tickets
  FOR UPDATE USING (
    assigned_to = auth.uid() OR
    EXISTS (SELECT 1 FROM public.support_agents WHERE user_id = auth.uid()) OR
    has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Super admins can view all tickets" ON public.support_tickets
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can update tickets" ON public.support_tickets
  FOR UPDATE USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Support ticket replies policies
CREATE POLICY "Users can view replies to their tickets" ON public.support_ticket_replies
  FOR SELECT USING (
    ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = auth.uid()) AND
    NOT is_internal
  );

CREATE POLICY "Users and support can create replies" ON public.support_ticket_replies
  FOR INSERT WITH CHECK (
    ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM public.support_agents WHERE user_id = auth.uid()) OR
    has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Support agents can view all replies" ON public.support_ticket_replies
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.support_agents WHERE user_id = auth.uid())
  );

CREATE POLICY "Super admins can view all replies" ON public.support_ticket_replies
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Support ticket reads policies
CREATE POLICY "Users can manage their support ticket reads" ON public.support_ticket_reads
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Support agents policies
CREATE POLICY "Support agents can view themselves" ON public.support_agents
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Super admins can manage support agents" ON public.support_agents
  FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can delete support agents" ON public.support_agents
  FOR DELETE USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Audit events policies
CREATE POLICY "Users can create audit events" ON public.audit_events
  FOR INSERT WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()) AND
    user_id = auth.uid()
  );

CREATE POLICY "Admins can view audit events" ON public.audit_events
  FOR SELECT USING (
    has_role(auth.uid(), 'admin'::app_role) AND
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Super admins can view all audit events" ON public.audit_events
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Device sessions policies
CREATE POLICY "Users can view their own device sessions" ON public.device_sessions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "System can insert device sessions" ON public.device_sessions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can revoke their own device sessions" ON public.device_sessions
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Super admins can view all device sessions" ON public.device_sessions
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can manage all device sessions" ON public.device_sessions
  FOR UPDATE USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Push subscriptions policies
CREATE POLICY "Users can manage their own subscriptions" ON public.push_subscriptions
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Super admins can view all push subscriptions" ON public.push_subscriptions
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Referral codes policies
CREATE POLICY "Users can view their own referral codes" ON public.referral_codes
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own referral codes" ON public.referral_codes
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Referrals policies
CREATE POLICY "Users can view referrals they made" ON public.referrals
  FOR SELECT USING (referrer_id = auth.uid());

CREATE POLICY "System can create referrals" ON public.referrals
  FOR INSERT WITH CHECK (true);

CREATE POLICY "System can update referrals" ON public.referrals
  FOR UPDATE USING (true);

-- User credits policies
CREATE POLICY "Users can view their own credits" ON public.user_credits
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "System can award credits" ON public.user_credits
  FOR INSERT WITH CHECK (true);

-- Integration sync policies
CREATE POLICY "Admins can view integration sync" ON public.integration_sync
  FOR SELECT USING (
    has_role(auth.uid(), 'admin'::app_role) AND
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Super admins can view all integration sync" ON public.integration_sync
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Master admin OTPs policies
CREATE POLICY "Super admins can view OTPs" ON public.master_admin_otps
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Allow system to insert OTPs" ON public.master_admin_otps
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow system to update OTPs" ON public.master_admin_otps
  FOR UPDATE USING (true);

-- Master admin backup codes policies
CREATE POLICY "Super admins can view backup codes" ON public.master_admin_backup_codes
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Allow system to insert backup codes" ON public.master_admin_backup_codes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow system to update backup codes" ON public.master_admin_backup_codes
  FOR UPDATE USING (true);

-- Master admin notes policies
CREATE POLICY "Super admins can manage notes" ON public.master_admin_notes
  FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Rate limit attempts policies
CREATE POLICY "System can manage rate limits" ON public.rate_limit_attempts
  FOR ALL USING (true)
  WITH CHECK (true);

CREATE POLICY "Super admins can view rate limits" ON public.rate_limit_attempts
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

-- ============================================================================
-- PART 12: PERFORMANCE INDEXES
-- ============================================================================

-- Profiles indexes
CREATE INDEX idx_profiles_clinic_id ON public.profiles(clinic_id);
CREATE INDEX idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX idx_profiles_email ON public.profiles(email);

-- User roles indexes
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);

-- Clinic roles indexes
CREATE INDEX idx_clinic_roles_user_id ON public.clinic_roles(user_id);
CREATE INDEX idx_clinic_roles_clinic_id ON public.clinic_roles(clinic_id);

-- Patients indexes
CREATE INDEX idx_patients_clinic_id ON public.patients(clinic_id);
CREATE INDEX idx_patients_owner_id ON public.patients(owner_id);
CREATE INDEX idx_patients_name ON public.patients(name);
CREATE INDEX idx_patients_patient_id ON public.patients USING GIN ((identifiers->'patient_id'));

-- Owners indexes
CREATE INDEX idx_owners_clinic_id ON public.owners(clinic_id);

-- Consults indexes
CREATE INDEX idx_consults_clinic_id ON public.consults(clinic_id);
CREATE INDEX idx_consults_patient_id ON public.consults(patient_id);
CREATE INDEX idx_consults_owner_id ON public.consults(owner_id);
CREATE INDEX idx_consults_vet_user_id ON public.consults(vet_user_id);
CREATE INDEX idx_consults_status ON public.consults(status);
CREATE INDEX idx_consults_started_at ON public.consults(started_at DESC);

-- Consult assignments indexes
CREATE INDEX idx_consult_assignments_consult_id ON public.consult_assignments(consult_id);
CREATE INDEX idx_consult_assignments_user_id ON public.consult_assignments(user_id);

-- Audio segments indexes
CREATE INDEX idx_audio_segments_consult_id ON public.consult_audio_segments(consult_id);
CREATE INDEX idx_audio_segments_clinic_id ON public.consult_audio_segments(clinic_id);

-- Case notes indexes
CREATE INDEX idx_case_notes_consult_id ON public.case_notes(consult_id);
CREATE INDEX idx_case_notes_clinic_id ON public.case_notes(clinic_id);

-- File assets indexes
CREATE INDEX idx_file_assets_clinic_id ON public.file_assets(clinic_id);
CREATE INDEX idx_file_assets_consult_id ON public.file_assets(consult_id);
CREATE INDEX idx_file_assets_created_at ON public.file_assets(created_at DESC);

-- Tasks indexes
CREATE INDEX idx_tasks_clinic_id ON public.tasks(clinic_id);
CREATE INDEX idx_tasks_consult_id ON public.tasks(consult_id);
CREATE INDEX idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_due_at ON public.tasks(due_at);

-- Messages indexes
CREATE INDEX idx_messages_clinic_id ON public.messages(clinic_id);
CREATE INDEX idx_messages_sender_id ON public.messages(sender_id);
CREATE INDEX idx_messages_recipient_id ON public.messages(recipient_id);
CREATE INDEX idx_messages_read ON public.messages(read);
CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);

-- Notifications indexes
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_clinic_id ON public.notifications(clinic_id);
CREATE INDEX idx_notifications_read ON public.notifications(read);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);

-- Chat messages indexes
CREATE INDEX idx_chat_messages_consult_id ON public.chat_messages(consult_id);
CREATE INDEX idx_chat_messages_clinic_id ON public.chat_messages(clinic_id);
CREATE INDEX idx_chat_messages_created_at ON public.chat_messages(created_at);

-- Support tickets indexes
CREATE INDEX idx_support_tickets_clinic_id ON public.support_tickets(clinic_id);
CREATE INDEX idx_support_tickets_user_id ON public.support_tickets(user_id);
CREATE INDEX idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX idx_support_tickets_assigned_to ON public.support_tickets(assigned_to);
CREATE INDEX idx_support_tickets_created_at ON public.support_tickets(created_at DESC);

-- Support ticket replies indexes
CREATE INDEX idx_support_ticket_replies_ticket_id ON public.support_ticket_replies(ticket_id);
CREATE INDEX idx_support_ticket_replies_created_at ON public.support_ticket_replies(created_at);

-- Device sessions indexes
CREATE INDEX idx_device_sessions_user_id ON public.device_sessions(user_id);
CREATE INDEX idx_device_sessions_clinic_id ON public.device_sessions(clinic_id);
CREATE INDEX idx_device_sessions_device_fingerprint ON public.device_sessions(device_fingerprint);
CREATE INDEX idx_device_sessions_last_active_at ON public.device_sessions(last_active_at);

-- Referrals indexes
CREATE INDEX idx_referrals_referrer_id ON public.referrals(referrer_id);
CREATE INDEX idx_referrals_referred_user_id ON public.referrals(referred_user_id);
CREATE INDEX idx_referrals_referral_code ON public.referrals(referral_code);

-- User credits indexes
CREATE INDEX idx_user_credits_user_id ON public.user_credits(user_id);

-- Audit events indexes
CREATE INDEX idx_audit_events_clinic_id ON public.audit_events(clinic_id);
CREATE INDEX idx_audit_events_user_id ON public.audit_events(user_id);
CREATE INDEX idx_audit_events_created_at ON public.audit_events(created_at DESC);

-- Rate limit attempts indexes
CREATE INDEX idx_rate_limit_attempts_identifier ON public.rate_limit_attempts(identifier);
CREATE INDEX idx_rate_limit_attempts_action ON public.rate_limit_attempts(action);