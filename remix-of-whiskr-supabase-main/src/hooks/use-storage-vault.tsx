import { useCallback } from 'react';
import { 
  isDespia, 
  setVaultItem, 
  getVaultItem,
  storeDeviceIdInVault,
  getDeviceIdFromVault
} from '@/lib/despia';

/**
 * React hook for accessing Despia Storage Vault
 * 
 * Features:
 * - Native vault on Despia (iCloud/Android KV Backup)
 * - localStorage fallback on web browsers
 * - Optional biometric protection for sensitive data
 * 
 * Usage:
 * const { storeItem, getItem, isNativeVaultAvailable } = useStorageVault();
 * await storeItem('key', 'value', true); // with biometric lock
 * const value = await getItem('key');
 */
export function useStorageVault() {
  const isNativeVaultAvailable = isDespia();
  
  /**
   * Store an item in the vault
   * @param key - Storage key
   * @param value - Value to store
   * @param requireBiometric - If true, requires Face ID/Touch ID to access (Despia only)
   */
  const storeItem = useCallback(async (
    key: string, 
    value: string, 
    requireBiometric: boolean = false
  ): Promise<boolean> => {
    if (!isNativeVaultAvailable) {
      // Fallback to localStorage on web
      try {
        localStorage.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    }
    return setVaultItem(key, value, requireBiometric);
  }, [isNativeVaultAvailable]);
  
  /**
   * Get an item from the vault
   * @param key - Storage key to retrieve
   */
  const getItem = useCallback(async (key: string): Promise<string | null> => {
    if (!isNativeVaultAvailable) {
      return localStorage.getItem(key);
    }
    return getVaultItem(key);
  }, [isNativeVaultAvailable]);
  
  /**
   * Store device fingerprint (for trial abuse prevention)
   * Persists across reinstalls on native
   */
  const storeDeviceId = useCallback(async (deviceId: string): Promise<boolean> => {
    if (!isNativeVaultAvailable) {
      try {
        localStorage.setItem('deviceFingerprint', deviceId);
        return true;
      } catch {
        return false;
      }
    }
    return storeDeviceIdInVault(deviceId);
  }, [isNativeVaultAvailable]);
  
  /**
   * Get stored device fingerprint
   */
  const getDeviceId = useCallback(async (): Promise<string | null> => {
    if (!isNativeVaultAvailable) {
      return localStorage.getItem('deviceFingerprint');
    }
    return getDeviceIdFromVault();
  }, [isNativeVaultAvailable]);
  
  /**
   * Remove an item from storage
   */
  const removeItem = useCallback(async (key: string): Promise<boolean> => {
    if (!isNativeVaultAvailable) {
      try {
        localStorage.removeItem(key);
        return true;
      } catch {
        return false;
      }
    }
    // Clear by setting empty value
    return setVaultItem(key, '', false);
  }, [isNativeVaultAvailable]);
  
  return {
    isNativeVaultAvailable,
    storeItem,
    getItem,
    storeDeviceId,
    getDeviceId,
    removeItem,
  };
}
