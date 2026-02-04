-- Add sender_name to chat_messages for team collaboration
ALTER TABLE public.chat_messages 
ADD COLUMN IF NOT EXISTS sender_name TEXT;