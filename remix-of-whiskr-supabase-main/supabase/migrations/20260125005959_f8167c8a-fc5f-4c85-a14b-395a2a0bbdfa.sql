-- ============================================================================
-- PART 11: ROW-LEVEL SECURITY POLICIES
-- ============================================================================

-- Clinics policies
CREATE POLICY "Users can view their clinic" ON public.clinics
  FOR SELECT USING (id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can update their clinic" ON public.clinics
  FOR UPDATE USING (
    has_role(auth.uid(), 'admin'::app_role) AND
    id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Super admins can view all clinics" ON public.clinics
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Profiles policies
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can view profiles in same clinic" ON public.profiles
  FOR SELECT USING (clinic_id = get_user_clinic_id());

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Admins can manage profiles" ON public.profiles
  FOR ALL USING (
    has_role(auth.uid(), 'admin'::app_role) AND
    clinic_id = get_user_clinic_id()
  );

CREATE POLICY "Super admins can view all profiles" ON public.profiles
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

-- User roles policies
CREATE POLICY "Users can view their own role" ON public.user_roles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Super admins can manage user roles" ON public.user_roles
  FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Clinic roles policies
CREATE POLICY "Users can view their clinic role" ON public.clinic_roles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can manage clinic roles" ON public.clinic_roles
  FOR ALL USING (
    has_role(auth.uid(), 'admin'::app_role) AND
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Super admins can manage clinic roles" ON public.clinic_roles
  FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can view all clinic roles" ON public.clinic_roles
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Owners policies
CREATE POLICY "Users can view owners in their clinic" ON public.owners
  FOR SELECT USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Staff with edit permissions can manage owners" ON public.owners
  FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()) AND
    can_edit_clinical_data(auth.uid(), clinic_id)
  );

CREATE POLICY "Super admins can view all owners" ON public.owners
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Patients policies
CREATE POLICY "Users can view patients in their clinic" ON public.patients
  FOR SELECT USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Staff with edit permissions can manage patients" ON public.patients
  FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()) AND
    can_edit_clinical_data(auth.uid(), clinic_id)
  );

CREATE POLICY "Super admins can view all patients" ON public.patients
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Support agents can view only ticket-related patients" ON public.patients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM support_agents sa
      JOIN support_tickets st ON st.related_consult_id IS NOT NULL
      JOIN consults c ON c.id = st.related_consult_id
      WHERE sa.user_id = auth.uid()
        AND c.patient_id = patients.id
        AND st.status IN ('open', 'in_progress')
    )
  );

-- Consults policies
CREATE POLICY "Users can view consults in their clinic" ON public.consults
  FOR SELECT USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Staff with edit permissions can create consults" ON public.consults
  FOR INSERT WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()) AND
    can_edit_clinical_data(auth.uid(), clinic_id)
  );

CREATE POLICY "Staff with edit permissions can update consults" ON public.consults
  FOR UPDATE USING (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()) AND
    can_edit_clinical_data(auth.uid(), clinic_id)
  );

CREATE POLICY "Staff with edit permissions can delete consults" ON public.consults
  FOR DELETE USING (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()) AND
    can_edit_clinical_data(auth.uid(), clinic_id)
  );

CREATE POLICY "Super admins can view all consults" ON public.consults
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Support agents can view only ticket-related consults" ON public.consults
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM support_agents sa
      JOIN support_tickets st ON st.clinic_id = consults.clinic_id
      WHERE sa.user_id = auth.uid()
        AND st.related_consult_id = consults.id
        AND st.status IN ('open', 'in_progress')
    )
  );

-- Consult assignments policies
CREATE POLICY "Users can view assignments in their clinic" ON public.consult_assignments
  FOR SELECT USING (
    consult_id IN (
      SELECT id FROM public.consults
      WHERE clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Staff with edit permissions can assign users" ON public.consult_assignments
  FOR INSERT WITH CHECK (
    consult_id IN (
      SELECT c.id FROM consults c
      JOIN profiles p ON p.clinic_id = c.clinic_id
      WHERE p.user_id = auth.uid()
        AND can_edit_clinical_data(auth.uid(), c.clinic_id)
    )
  );

CREATE POLICY "Staff with edit permissions can remove assignments" ON public.consult_assignments
  FOR DELETE USING (
    consult_id IN (
      SELECT c.id FROM consults c
      JOIN profiles p ON p.clinic_id = c.clinic_id
      WHERE p.user_id = auth.uid()
        AND can_edit_clinical_data(auth.uid(), c.clinic_id)
    )
  );

CREATE POLICY "Super admins can view all consult assignments" ON public.consult_assignments
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Audio segments policies
CREATE POLICY "Users can view own segments" ON public.consult_audio_segments
  FOR SELECT USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own segments" ON public.consult_audio_segments
  FOR INSERT WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()) AND
    user_id = auth.uid()
  );

CREATE POLICY "Super admins can view all audio segments" ON public.consult_audio_segments
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Case notes policies
CREATE POLICY "Users can view case notes in their clinic" ON public.case_notes
  FOR SELECT USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Staff with edit permissions can create case notes" ON public.case_notes
  FOR INSERT WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()) AND
    can_edit_clinical_data(auth.uid(), clinic_id)
  );

CREATE POLICY "Staff with edit permissions can update case notes" ON public.case_notes
  FOR UPDATE USING (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()) AND
    can_edit_clinical_data(auth.uid(), clinic_id)
  );

CREATE POLICY "Super admins can view all case notes" ON public.case_notes
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

-- File assets policies
CREATE POLICY "Users can view files in their clinic" ON public.file_assets
  FOR SELECT USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can upload files to their clinic" ON public.file_assets
  FOR INSERT WITH CHECK (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Super admins can view all files" ON public.file_assets
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Tasks policies
CREATE POLICY "Users can view tasks in their clinic" ON public.tasks
  FOR SELECT USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Staff can create tasks" ON public.tasks
  FOR INSERT WITH CHECK (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Staff can update tasks" ON public.tasks
  FOR UPDATE USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Staff can delete tasks" ON public.tasks
  FOR DELETE USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Super admins can view all tasks" ON public.tasks
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Messages policies
CREATE POLICY "Users can view messages in their clinic" ON public.messages
  FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()) AND
    (sender_id = auth.uid() OR recipient_id = auth.uid() OR recipient_id IS NULL)
  );

CREATE POLICY "Users can send messages" ON public.messages
  FOR INSERT WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()) AND
    sender_id = auth.uid()
  );

CREATE POLICY "Users can mark their messages as read" ON public.messages
  FOR UPDATE USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

CREATE POLICY "Super admins can view all messages" ON public.messages
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Notifications policies
CREATE POLICY "Users can view their own notifications" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "System can insert notifications" ON public.notifications
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own notifications" ON public.notifications
  FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "Super admins can view all notifications" ON public.notifications
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));