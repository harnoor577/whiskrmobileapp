-- Create the medical-history bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('medical-history', 'medical-history', false)
ON CONFLICT (id) DO NOTHING;

-- RLS Policy: Allow authenticated users to upload to their clinic folder
CREATE POLICY "Users can upload medical history to their clinic folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'medical-history' AND
  (storage.foldername(name))[1] IN (
    SELECT clinic_id::text FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- RLS Policy: Allow authenticated users to read from their clinic folder
CREATE POLICY "Users can read medical history from their clinic folder"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'medical-history' AND
  (storage.foldername(name))[1] IN (
    SELECT clinic_id::text FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- RLS Policy: Allow authenticated users to delete from their clinic folder
CREATE POLICY "Users can delete medical history from their clinic folder"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'medical-history' AND
  (storage.foldername(name))[1] IN (
    SELECT clinic_id::text FROM public.profiles WHERE user_id = auth.uid()
  )
);