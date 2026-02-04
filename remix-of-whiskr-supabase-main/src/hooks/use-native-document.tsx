/**
 * Hook for native document sharing and printing
 * 
 * Provides platform-aware document actions:
 * - On Despia (iOS/Android): Uses native share sheet and AirPrint
 * - On web: Falls back to browser download and print
 */

import { useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { isDespia, shareFile, shareBlobFile, printDocument, printBlobDocument } from '@/lib/despia';
import { createTempUploader } from '@/utils/tempFileUpload';
import { toast } from 'sonner';

interface UseNativeDocumentOptions {
  /** Custom clinic ID override (defaults to user's clinic) */
  clinicId?: string;
}

interface DocumentActions {
  /** Whether running on native platform */
  isNative: boolean;
  
  /** Share a file from URL */
  shareFromUrl: (url: string) => Promise<void>;
  
  /** Share a file from Blob (e.g., generated PDF) */
  shareFromBlob: (blob: Blob, fileName: string) => Promise<void>;
  
  /** Print a document from URL */
  printFromUrl: (url: string) => Promise<void>;
  
  /** Print a document from Blob */
  printFromBlob: (blob: Blob) => Promise<void>;
  
  /** Download a file from URL (always works) */
  downloadFromUrl: (url: string, fileName: string) => void;
  
  /** Download a blob as file (always works) */
  downloadFromBlob: (blob: Blob, fileName: string) => void;
}

export function useNativeDocument(options: UseNativeDocumentOptions = {}): DocumentActions {
  const { clinicId: authClinicId } = useAuth();
  const clinicId = options.clinicId || authClinicId;
  
  const isNative = isDespia();
  
  // Create temp uploader for this clinic
  const tempUploader = clinicId ? createTempUploader(clinicId) : undefined;
  
  /**
   * Share a file from a URL
   */
  const shareFromUrl = useCallback(async (url: string) => {
    if (isNative) {
      const success = await shareFile(url);
      if (success) {
        toast.success('Share sheet opened');
      } else {
        toast.error('Sharing not available');
      }
    } else {
      // Web fallback: Download
      const a = document.createElement('a');
      a.href = url;
      a.download = '';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success('Download started');
    }
  }, [isNative]);
  
  /**
   * Share a file from a Blob
   */
  const shareFromBlob = useCallback(async (blob: Blob, fileName: string) => {
    if (isNative && tempUploader) {
      const success = await shareBlobFile(blob, fileName, tempUploader);
      if (success) {
        toast.success('Share sheet opened');
      } else {
        // Fallback to download
        downloadFromBlob(blob, fileName);
      }
    } else {
      // Web: Direct download
      downloadFromBlob(blob, fileName);
    }
  }, [isNative, tempUploader]);
  
  /**
   * Print a document from URL
   */
  const printFromUrl = useCallback(async (url: string) => {
    if (isNative) {
      const success = await printDocument(url);
      if (success) {
        toast.success('Opening printer...');
      } else {
        toast.error('Printing not available');
      }
    } else {
      // Web: Open in new window and print
      const printWindow = window.open(url, '_blank');
      if (printWindow) {
        printWindow.onload = () => printWindow.print();
      }
    }
  }, [isNative]);
  
  /**
   * Print a document from Blob
   */
  const printFromBlob = useCallback(async (blob: Blob) => {
    if (isNative && tempUploader) {
      const success = await printBlobDocument(blob, tempUploader);
      if (success) {
        toast.success('Opening printer...');
      } else {
        // Fallback to browser print
        window.print();
      }
    } else {
      // Web: Use iframe print
      const success = await printBlobDocument(blob);
      if (!success) {
        window.print();
      }
    }
  }, [isNative, tempUploader]);
  
  /**
   * Download from URL (always works)
   */
  const downloadFromUrl = useCallback((url: string, fileName: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success('Download started');
  }, []);
  
  /**
   * Download blob as file (always works)
   */
  const downloadFromBlob = useCallback((blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Download started');
  }, []);
  
  return {
    isNative,
    shareFromUrl,
    shareFromBlob,
    printFromUrl,
    printFromBlob,
    downloadFromUrl,
    downloadFromBlob,
  };
}
