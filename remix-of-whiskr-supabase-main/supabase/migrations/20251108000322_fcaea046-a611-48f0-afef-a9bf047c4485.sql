-- Add check constraint for valid message roles including 'system'
ALTER TABLE chat_messages 
DROP CONSTRAINT IF EXISTS chat_messages_role_check;

ALTER TABLE chat_messages
ADD CONSTRAINT chat_messages_role_check 
CHECK (role IN ('user', 'assistant', 'case_note', 'system'));

COMMENT ON COLUMN chat_messages.role IS 
'Message role: user (veterinarian/staff input), assistant (AI response), case_note (manual note), system (automated notifications like visit type changes)';