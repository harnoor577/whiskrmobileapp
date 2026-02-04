/**
 * Despia Native SDK Utilities
 * Platform detection and native feature access for Despia mobile app wrapper
 */

import despia from 'despia-native';

/**
 * Check if the app is running inside Despia native wrapper
 */
export const isDespia = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return navigator.userAgent.toLowerCase().includes('despia');
};

/**
 * Check if running on iOS via Despia
 */
export const isIOS = (): boolean => {
  if (!isDespia()) return false;
  const ua = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua);
};

/**
 * Check if running on Android via Despia
 */
export const isAndroid = (): boolean => {
  if (!isDespia()) return false;
  return navigator.userAgent.toLowerCase().includes('android');
};

/**
 * Get the current platform
 */
export const getPlatform = (): 'ios' | 'android' | 'web' => {
  if (isIOS()) return 'ios';
  if (isAndroid()) return 'android';
  return 'web';
};

/**
 * Haptic feedback types supported by Despia
 */
export type HapticType = 'light' | 'success' | 'warning' | 'error' | 'heavy';

/**
 * Mapping of haptic types to Despia URL schemes
 */
const hapticSchemes: Record<HapticType, string> = {
  light: 'lighthaptic://',
  success: 'successhaptic://',
  warning: 'warninghaptic://',
  error: 'errorhaptic://',
  heavy: 'heavyhaptic://',
};

/**
 * Trigger haptic feedback on native devices
 * No-op on web browsers
 */
export const haptic = (type: HapticType = 'light'): void => {
  if (!isDespia()) return;
  
  try {
    // Create a hidden iframe to trigger the URL scheme
    // This prevents navigation issues
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = hapticSchemes[type];
    document.body.appendChild(iframe);
    
    // Clean up after a short delay
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 100);
  } catch (e) {
    console.warn('Haptic feedback not available:', e);
  }
};

// ============================================
// GPS Location Functions (Native Only)
// ============================================

/**
 * Location data structure
 */
export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

/**
 * Enable background location tracking (native only)
 * Triggers native iOS/Android high-accuracy location services
 */
export const enableBackgroundLocation = (): void => {
  if (!isDespia()) return;
  
  try {
    despia('backgroundlocationon://');
  } catch (e) {
    console.warn('Background location not available:', e);
  }
};

/**
 * Disable background location tracking (native only)
 * Saves battery by turning off GPS
 */
export const disableBackgroundLocation = (): void => {
  if (!isDespia()) return;
  
  try {
    despia('backgroundlocationoff://');
  } catch (e) {
    console.warn('Could not disable background location:', e);
  }
};

/**
 * Get current location silently
 * Uses native GPS on Despia, falls back to browser geolocation
 */
export const getCurrentLocation = (): Promise<LocationData> => {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        });
      },
      (error) => reject(error),
      { 
        enableHighAccuracy: true, 
        timeout: 5000, // 5 second timeout for silent collection
        maximumAge: 60000 // Use cached location if within 1 minute
      }
    );
  });
};

/**
 * Silently capture and format location for storage
 * Returns formatted "lat, lng" string or null on failure
 * Only works on native Despia app - no-op on web
 */
export const captureLocationSilently = async (): Promise<string | null> => {
  if (!isDespia()) return null; // Only on native app
  
  try {
    // Enable high-accuracy native GPS
    enableBackgroundLocation();
    
    const location = await getCurrentLocation();
    
    // Disable after getting location to save battery
    disableBackgroundLocation();
    
    // Format as "lat, lng" string for storage
    return `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`;
  } catch (e) {
    console.warn('Silent location capture failed:', e);
    disableBackgroundLocation();
    return null;
  }
};

// ============================================
// Storage Vault Functions (Native Only)
// ============================================

/**
 * Store data in native vault (iCloud/Android KV Backup)
 * Data persists across reinstalls and syncs across devices
 * 
 * @param key - Unique identifier for the data
 * @param value - String value to store
 * @param locked - If true, requires biometric auth to access
 */
export const setVaultItem = async (
  key: string, 
  value: string, 
  locked: boolean = false
): Promise<boolean> => {
  if (!isDespia()) return false;
  
  try {
    await despia(`setvault://?key=${encodeURIComponent(key)}&value=${encodeURIComponent(value)}&locked=${locked}`);
    return true;
  } catch (e) {
    console.warn('Storage vault write failed:', e);
    return false;
  }
};

/**
 * Read data from native vault
 * Returns null if not found or on web
 * 
 * @param key - Key to retrieve
 */
export const getVaultItem = async (key: string): Promise<string | null> => {
  if (!isDespia()) return null;
  
  try {
    const result = await despia(`readvault://?key=${encodeURIComponent(key)}`, [key]);
    return result?.[key] || null;
  } catch (e) {
    console.warn('Storage vault read failed:', e);
    return null;
  }
};

/**
 * Store device fingerprint in vault (persists across reinstalls)
 * Useful for trial abuse prevention
 */
export const storeDeviceIdInVault = async (deviceId: string): Promise<boolean> => {
  return setVaultItem('deviceFingerprint', deviceId, false);
};

/**
 * Get stored device fingerprint from vault
 */
export const getDeviceIdFromVault = async (): Promise<string | null> => {
  return getVaultItem('deviceFingerprint');
};

/**
 * Store secure token with biometric protection
 */
export const storeSecureToken = async (token: string): Promise<boolean> => {
  return setVaultItem('secureToken', token, true); // Requires Face ID/Touch ID
};

/**
 * Get secure token (triggers biometric prompt)
 */
export const getSecureToken = async (): Promise<string | null> => {
  return getVaultItem('secureToken');
};

// ============================================
// File Sharing Functions (Native Only)
// ============================================

/**
 * Share a file using native share sheet
 * On Despia: Opens iOS/Android native share modal (AirDrop, Files, Mail, etc.)
 * On web: Falls back to Web Share API or returns false
 * 
 * @param fileUrl - HTTPS URL to the file (must have proper Content-Type headers)
 * @returns true if share was triggered, false if not available
 */
export const shareFile = async (fileUrl: string): Promise<boolean> => {
  if (isDespia()) {
    try {
      // Despia intercepts HTTPS URLs and opens native share sheet
      despia(fileUrl);
      return true;
    } catch (e) {
      console.warn('Native file sharing failed:', e);
      return false;
    }
  }
  
  // Web fallback: Use Web Share API if available
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        url: fileUrl,
        title: 'Shared Document',
      });
      return true;
    } catch (e) {
      // User cancelled or share failed
      console.warn('Web Share API failed:', e);
      return false;
    }
  }
  
  return false;
};

/**
 * Share a file from a Blob by creating a temporary object URL
 * Useful for locally-generated PDFs
 * 
 * On native: Uploads to temp storage and shares the URL
 * On web: Opens blob in new tab for download
 * 
 * @param blob - File blob to share
 * @param fileName - Display name for the file
 * @param uploadToStorage - Function to upload blob and return URL (for native sharing)
 */
export const shareBlobFile = async (
  blob: Blob,
  fileName: string,
  uploadToStorage?: (blob: Blob, fileName: string) => Promise<string | null>
): Promise<boolean> => {
  if (isDespia() && uploadToStorage) {
    try {
      // Upload to temp storage and get signed URL
      const url = await uploadToStorage(blob, fileName);
      if (url) {
        despia(url);
        return true;
      }
    } catch (e) {
      console.warn('Native blob sharing failed:', e);
    }
  }
  
  // Web fallback: Create object URL and open in new tab
  try {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch (e) {
    console.warn('Blob download failed:', e);
    return false;
  }
};

/**
 * Share app or content with a custom message
 * Opens native share sheet with text and optional URL
 * 
 * @param message - Text message to share
 * @param url - Optional URL to include
 */
export const shareContent = async (
  message: string,
  url?: string
): Promise<boolean> => {
  if (isDespia()) {
    try {
      const shareUrl = url 
        ? `shareapp://message?=${encodeURIComponent(message)}&url=${encodeURIComponent(url)}`
        : `shareapp://message?=${encodeURIComponent(message)}`;
      despia(shareUrl);
      return true;
    } catch (e) {
      console.warn('Native content sharing failed:', e);
      return false;
    }
  }
  
  // Web fallback
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        text: message,
        url: url,
      });
      return true;
    } catch (e) {
      console.warn('Web Share API failed:', e);
      return false;
    }
  }
  
  return false;
};

// ============================================
// Print Functions (Native Only)
// ============================================

/**
 * Print a document using native printing
 * On Despia iOS: Triggers AirPrint dialog
 * On Despia Android: Opens native print service
 * On web: Uses window.print()
 * 
 * @param fileUrl - HTTPS URL to the document
 * @returns true if print was triggered
 */
export const printDocument = async (fileUrl: string): Promise<boolean> => {
  if (isDespia()) {
    try {
      // Despia print protocol
      despia(`print://${fileUrl}`);
      return true;
    } catch (e) {
      console.warn('Native printing failed:', e);
      return false;
    }
  }
  
  // Web fallback: Open URL in new window and print
  try {
    const printWindow = window.open(fileUrl, '_blank');
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
      };
      return true;
    }
  } catch (e) {
    console.warn('Web print failed:', e);
  }
  
  return false;
};

/**
 * Print a blob file (generates temp URL and prints)
 * Useful for locally-generated PDFs
 * 
 * @param blob - File blob to print
 * @param uploadToStorage - Optional function to upload blob for native printing
 */
export const printBlobDocument = async (
  blob: Blob,
  uploadToStorage?: (blob: Blob, fileName: string) => Promise<string | null>
): Promise<boolean> => {
  if (isDespia() && uploadToStorage) {
    try {
      const url = await uploadToStorage(blob, `print-${Date.now()}.pdf`);
      if (url) {
        despia(`print://${url}`);
        return true;
      }
    } catch (e) {
      console.warn('Native blob printing failed:', e);
    }
  }
  
  // Web fallback: Create object URL and print
  try {
    const url = URL.createObjectURL(blob);
    const printFrame = document.createElement('iframe');
    printFrame.style.display = 'none';
    printFrame.src = url;
    document.body.appendChild(printFrame);
    
    printFrame.onload = () => {
      try {
        printFrame.contentWindow?.print();
      } catch (e) {
        // Cross-origin issues, fallback to window.print
        window.print();
      }
      // Clean up after a delay
      setTimeout(() => {
        document.body.removeChild(printFrame);
        URL.revokeObjectURL(url);
      }, 1000);
    };
    
    return true;
  } catch (e) {
    console.warn('Blob print failed:', e);
    // Ultimate fallback
    window.print();
    return true;
  }
};

/**
 * Take a screenshot and save to device (native only)
 * No-op on web
 */
export const takeScreenshot = (): void => {
  if (!isDespia()) return;
  
  try {
    despia('takescreenshot://');
  } catch (e) {
    console.warn('Screenshot failed:', e);
  }
};

/**
 * Save an image from URL to device photo library (native only)
 * 
 * @param imageUrl - HTTPS URL to the image
 */
export const saveImageToDevice = async (imageUrl: string): Promise<boolean> => {
  if (!isDespia()) return false;
  
  try {
    despia(`savethisimage://?url=${encodeURIComponent(imageUrl)}`);
    return true;
  } catch (e) {
    console.warn('Save image failed:', e);
    return false;
  }
};
