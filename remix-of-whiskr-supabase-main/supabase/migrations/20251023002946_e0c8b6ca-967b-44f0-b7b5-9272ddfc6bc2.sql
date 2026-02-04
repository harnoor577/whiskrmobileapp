-- Enable realtime for chat_messages table
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- Enable realtime for consult_assignments table  
ALTER PUBLICATION supabase_realtime ADD TABLE public.consult_assignments;