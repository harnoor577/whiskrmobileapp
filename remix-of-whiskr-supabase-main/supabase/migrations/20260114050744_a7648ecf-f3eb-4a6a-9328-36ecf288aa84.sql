-- Create medical-history storage bucket for uploaded medical history documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'medical-history', 
  'medical-history', 
  false,
  52428800, -- 50MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for medical-history bucket
CREATE POLICY "Users can upload medical history to their clinic"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'medical-history' 
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] IN (
    SELECT clinic_id::text FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can view medical history from their clinic"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'medical-history'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] IN (
    SELECT clinic_id::text FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete medical history from their clinic"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'medical-history'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] IN (
    SELECT clinic_id::text FROM public.profiles WHERE user_id = auth.uid()
  )
);