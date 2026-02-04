/**
 * Temporary File Upload Utility
 * 
 * Uploads files to temporary storage for native file sharing/printing.
 * Files are stored with a short TTL and cleaned up automatically.
 */

import { supabase } from '@/integrations/supabase/client';

/**
 * Upload a blob to temporary storage and return a signed URL
 * Files are stored in the temp-files bucket and auto-expire
 * 
 * @param blob - The file blob to upload
 * @param fileName - Desired file name
 * @param clinicId - Clinic ID for folder organization
 * @returns Signed URL valid for 1 hour, or null on failure
 */
export async function uploadTempFile(
  blob: Blob,
  fileName: string,
  clinicId: string
): Promise<string | null> {
  try {
    // Generate unique path: clinic_id/timestamp_filename
    const timestamp = Date.now();
    const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `${clinicId}/${timestamp}_${safeName}`;
    
    // Upload to temp-files bucket
    const { data, error } = await supabase.storage
      .from('temp-files')
      .upload(filePath, blob, {
        contentType: blob.type || 'application/pdf',
        cacheControl: '3600', // 1 hour cache
        upsert: false,
      });
    
    if (error) {
      console.error('Temp file upload failed:', error);
      return null;
    }
    
    // Get signed URL (valid for 1 hour)
    const { data: urlData, error: urlError } = await supabase.storage
      .from('temp-files')
      .createSignedUrl(data.path, 3600); // 1 hour expiry
    
    if (urlError) {
      console.error('Failed to create signed URL:', urlError);
      return null;
    }
    
    return urlData.signedUrl;
  } catch (e) {
    console.error('Temp file upload error:', e);
    return null;
  }
}

/**
 * Create an upload function bound to a specific clinic
 * Returns a function compatible with despia sharing utilities
 * 
 * @param clinicId - Clinic ID to use for uploads
 */
export function createTempUploader(clinicId: string) {
  return async (blob: Blob, fileName: string): Promise<string | null> => {
    return uploadTempFile(blob, fileName, clinicId);
  };
}

/**
 * Clean up temporary files for a clinic (optional, for logout)
 * Note: Files also auto-expire via database function
 * 
 * @param clinicId - Clinic ID to clean up
 */
export async function cleanupTempFiles(clinicId: string): Promise<void> {
  try {
    // List all files in the clinic's temp folder
    const { data: files } = await supabase.storage
      .from('temp-files')
      .list(clinicId);
    
    if (files && files.length > 0) {
      const filePaths = files.map(f => `${clinicId}/${f.name}`);
      await supabase.storage
        .from('temp-files')
        .remove(filePaths);
    }
  } catch (e) {
    console.warn('Temp file cleanup failed:', e);
  }
}
