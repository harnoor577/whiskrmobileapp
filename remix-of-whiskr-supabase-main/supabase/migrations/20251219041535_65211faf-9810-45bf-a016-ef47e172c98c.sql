-- Add UPDATE policy so users can mark notifications as sent
CREATE POLICY "Users can update their clinic notifications"
ON consult_usage_notifications
FOR UPDATE
USING (
  clinic_id IN (
    SELECT profiles.clinic_id 
    FROM profiles 
    WHERE profiles.user_id = auth.uid()
  )
);