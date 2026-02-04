-- Allow users to update their own chat messages
CREATE POLICY "Users can update their own chat messages"
ON chat_messages
FOR UPDATE
USING (
  user_id = auth.uid() 
  AND clinic_id IN (
    SELECT clinic_id FROM profiles WHERE user_id = auth.uid()
  )
  AND created_at > (now() - interval '5 minutes')
)
WITH CHECK (
  user_id = auth.uid() 
  AND clinic_id IN (
    SELECT clinic_id FROM profiles WHERE user_id = auth.uid()
  )
);