-- Create temp-files bucket for native file sharing
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'temp-files', 
  'temp-files', 
  false, 
  10485760, -- 10MB limit
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

-- RLS Policy: Users can upload to their clinic's folder
CREATE POLICY "Users can upload temp files to their clinic folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'temp-files' 
  AND (storage.foldername(name))[1] = (
    SELECT clinic_id::text FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
  )
);

-- RLS Policy: Users can read their clinic's temp files
CREATE POLICY "Users can read their clinic temp files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'temp-files' 
  AND (storage.foldername(name))[1] = (
    SELECT clinic_id::text FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
  )
);

-- RLS Policy: Users can delete their clinic's temp files
CREATE POLICY "Users can delete their clinic temp files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'temp-files' 
  AND (storage.foldername(name))[1] = (
    SELECT clinic_id::text FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
  )
);

-- Function to clean up expired temp files (older than 1 hour)
CREATE OR REPLACE FUNCTION public.cleanup_temp_files()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  DELETE FROM storage.objects
  WHERE bucket_id = 'temp-files'
  AND created_at < NOW() - INTERVAL '1 hour';
END;
$$;