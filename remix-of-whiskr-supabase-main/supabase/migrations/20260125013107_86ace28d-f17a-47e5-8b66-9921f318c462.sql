-- Create the diagnostic-images storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'diagnostic-images',
  'diagnostic-images',
  false,
  52428800, -- 50MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'image/dicom']
);

-- Policy: Users can upload files to their clinic's folder
CREATE POLICY "Users can upload diagnostic images to their clinic"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'diagnostic-images'
  AND (storage.foldername(name))[1] IN (
    SELECT clinic_id::text FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Policy: Users can view files in their clinic's folder
CREATE POLICY "Users can view diagnostic images in their clinic"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'diagnostic-images'
  AND (storage.foldername(name))[1] IN (
    SELECT clinic_id::text FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Policy: Users can update files in their clinic's folder
CREATE POLICY "Users can update diagnostic images in their clinic"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'diagnostic-images'
  AND (storage.foldername(name))[1] IN (
    SELECT clinic_id::text FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Policy: Users can delete files in their clinic's folder
CREATE POLICY "Users can delete diagnostic images in their clinic"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'diagnostic-images'
  AND (storage.foldername(name))[1] IN (
    SELECT clinic_id::text FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Policy: Super admins can access all diagnostic images
CREATE POLICY "Super admins can access all diagnostic images"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'diagnostic-images'
  AND public.has_role(auth.uid(), 'super_admin'::app_role)
);