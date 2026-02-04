-- Create storage bucket for diagnostic images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'diagnostic-images',
  'diagnostic-images',
  false,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']
);

-- Create RLS policies for diagnostic images bucket
CREATE POLICY "Users can upload diagnostic images"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'diagnostic-images' AND
  auth.uid() IS NOT NULL
);

CREATE POLICY "Users can view diagnostic images in their clinic"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'diagnostic-images' AND
  auth.uid() IS NOT NULL
);

CREATE POLICY "Users can delete their own diagnostic images"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'diagnostic-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Add attachments column to chat_messages table
ALTER TABLE public.chat_messages
ADD COLUMN attachments jsonb DEFAULT '[]'::jsonb;