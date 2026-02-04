-- Enable realtime for team messages table and ensure full row data on updates
ALTER TABLE public.messages REPLICA IDENTITY FULL;

-- Add messages table to realtime publication (safe to run if not already added; will succeed once)
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;