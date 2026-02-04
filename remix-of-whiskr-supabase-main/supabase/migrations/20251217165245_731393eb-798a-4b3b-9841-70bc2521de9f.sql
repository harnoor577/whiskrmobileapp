-- Add explicit auth.uid() IS NOT NULL checks to RLS policies for defense-in-depth
-- This ensures authenticated users only, satisfying HIPAA/PIPEDA compliance requirements

-- Update profiles table policies
DROP POLICY IF EXISTS "Users can view profiles in same clinic" ON profiles;
CREATE POLICY "Users can view profiles in same clinic"
ON profiles FOR SELECT
USING (auth.uid() IS NOT NULL AND clinic_id = get_user_clinic_id());

DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile"
ON profiles FOR UPDATE
USING (auth.uid() IS NOT NULL AND user_id = auth.uid());

DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
CREATE POLICY "Users can view their own profile"
ON profiles FOR SELECT
USING (auth.uid() IS NOT NULL AND user_id = auth.uid());

-- Update consults table policies
DROP POLICY IF EXISTS "Users can view consults in their clinic" ON consults;
CREATE POLICY "Users can view consults in their clinic"
ON consults FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Clinical staff can update consults" ON consults;
CREATE POLICY "Clinical staff can update consults"
ON consults FOR UPDATE
USING (
  auth.uid() IS NOT NULL 
  AND clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid())
  AND (
    EXISTS (
      SELECT 1 FROM clinic_roles
      WHERE clinic_roles.user_id = auth.uid()
        AND clinic_roles.clinic_id = consults.clinic_id
        AND clinic_roles.role = ANY (ARRAY['vet_tech'::clinic_role, 'vet'::clinic_role])
    )
    OR can_edit_clinical_data(auth.uid(), clinic_id)
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid())
  AND (
    EXISTS (
      SELECT 1 FROM clinic_roles
      WHERE clinic_roles.user_id = auth.uid()
        AND clinic_roles.clinic_id = consults.clinic_id
        AND clinic_roles.role = ANY (ARRAY['vet_tech'::clinic_role, 'vet'::clinic_role])
    )
    OR can_edit_clinical_data(auth.uid(), clinic_id)
  )
);

DROP POLICY IF EXISTS "Staff with edit permissions can create consults" ON consults;
CREATE POLICY "Staff with edit permissions can create consults"
ON consults FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid())
  AND can_edit_clinical_data(auth.uid(), clinic_id)
);

DROP POLICY IF EXISTS "Staff with edit permissions can delete consults" ON consults;
CREATE POLICY "Staff with edit permissions can delete consults"
ON consults FOR DELETE
USING (
  auth.uid() IS NOT NULL 
  AND clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid())
  AND can_edit_clinical_data(auth.uid(), clinic_id)
);

-- Update patients table policies
DROP POLICY IF EXISTS "Users can view patients in their clinic" ON patients;
CREATE POLICY "Users can view patients in their clinic"
ON patients FOR SELECT
USING (auth.uid() IS NOT NULL AND clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert patients in their clinic" ON patients;
CREATE POLICY "Users can insert patients in their clinic"
ON patients FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update patients in their clinic" ON patients;
CREATE POLICY "Users can update patients in their clinic"
ON patients FOR UPDATE
USING (auth.uid() IS NOT NULL AND clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete patients in their clinic" ON patients;
CREATE POLICY "Users can delete patients in their clinic"
ON patients FOR DELETE
USING (auth.uid() IS NOT NULL AND clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()));

-- Update owners table policies
DROP POLICY IF EXISTS "Users can view owners in their clinic" ON owners;
CREATE POLICY "Users can view owners in their clinic"
ON owners FOR SELECT
USING (auth.uid() IS NOT NULL AND clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert owners in their clinic" ON owners;
CREATE POLICY "Users can insert owners in their clinic"
ON owners FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update owners in their clinic" ON owners;
CREATE POLICY "Users can update owners in their clinic"
ON owners FOR UPDATE
USING (auth.uid() IS NOT NULL AND clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete owners in their clinic" ON owners;
CREATE POLICY "Users can delete owners in their clinic"
ON owners FOR DELETE
USING (auth.uid() IS NOT NULL AND clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()));

-- Update user_invitations table policies
DROP POLICY IF EXISTS "Admins can view invitations for their clinic" ON user_invitations;
CREATE POLICY "Admins can view invitations for their clinic"
ON user_invitations FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND has_role(auth.uid(), 'admin'::app_role) 
  AND clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Admins can create invitations for their clinic" ON user_invitations;
CREATE POLICY "Admins can create invitations for their clinic"
ON user_invitations FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND has_role(auth.uid(), 'admin'::app_role) 
  AND clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid())
);

-- Update file_assets table policies
DROP POLICY IF EXISTS "Users can view files in their clinic" ON file_assets;
CREATE POLICY "Users can view files in their clinic"
ON file_assets FOR SELECT
USING (auth.uid() IS NOT NULL AND clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert files in their clinic" ON file_assets;
CREATE POLICY "Users can insert files in their clinic"
ON file_assets FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update files in their clinic" ON file_assets;
CREATE POLICY "Users can update files in their clinic"
ON file_assets FOR UPDATE
USING (auth.uid() IS NOT NULL AND clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete files in their clinic" ON file_assets;
CREATE POLICY "Users can delete files in their clinic"
ON file_assets FOR DELETE
USING (auth.uid() IS NOT NULL AND clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()));

-- Update chat_messages table policies
DROP POLICY IF EXISTS "Users can view chat messages in their clinic" ON chat_messages;
CREATE POLICY "Users can view chat messages in their clinic"
ON chat_messages FOR SELECT
USING (auth.uid() IS NOT NULL AND clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert chat messages in their clinic" ON chat_messages;
CREATE POLICY "Users can insert chat messages in their clinic"
ON chat_messages FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid())
  AND user_id = auth.uid()
);

-- Update messages table policies
DROP POLICY IF EXISTS "Users can view messages in their clinic" ON messages;
CREATE POLICY "Users can view messages in their clinic"
ON messages FOR SELECT
USING (auth.uid() IS NOT NULL AND clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert messages in their clinic" ON messages;
CREATE POLICY "Users can insert messages in their clinic"
ON messages FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid())
  AND sender_id = auth.uid()
);

-- Update tasks table policies
DROP POLICY IF EXISTS "Users can view tasks in their clinic" ON tasks;
CREATE POLICY "Users can view tasks in their clinic"
ON tasks FOR SELECT
USING (auth.uid() IS NOT NULL AND clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert tasks in their clinic" ON tasks;
CREATE POLICY "Users can insert tasks in their clinic"
ON tasks FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update tasks in their clinic" ON tasks;
CREATE POLICY "Users can update tasks in their clinic"
ON tasks FOR UPDATE
USING (auth.uid() IS NOT NULL AND clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete tasks in their clinic" ON tasks;
CREATE POLICY "Users can delete tasks in their clinic"
ON tasks FOR DELETE
USING (auth.uid() IS NOT NULL AND clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()));

-- Update templates table policies
DROP POLICY IF EXISTS "Users can view templates in their clinic" ON templates;
CREATE POLICY "Users can view templates in their clinic"
ON templates FOR SELECT
USING (auth.uid() IS NOT NULL AND clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert templates in their clinic" ON templates;
CREATE POLICY "Users can insert templates in their clinic"
ON templates FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update templates in their clinic" ON templates;
CREATE POLICY "Users can update templates in their clinic"
ON templates FOR UPDATE
USING (auth.uid() IS NOT NULL AND clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete templates in their clinic" ON templates;
CREATE POLICY "Users can delete templates in their clinic"
ON templates FOR DELETE
USING (auth.uid() IS NOT NULL AND clinic_id IN (SELECT clinic_id FROM profiles WHERE user_id = auth.uid()));