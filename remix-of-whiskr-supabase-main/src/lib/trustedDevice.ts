// Utility functions for managing trusted device storage with expiration
// Uses native vault on Despia (persists across reinstalls), localStorage fallback for web

import { isDespia, setVaultItem, getVaultItem } from './despia';

const TRUSTED_DEVICE_KEY = 'trustedDevice';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

interface TrustedDeviceData {
  fingerprint: string;
  expires: number;
}

/**
 * Store a trusted device fingerprint with 30-day expiration
 * Uses native vault on Despia (persists across reinstalls)
 * Falls back to localStorage on web
 */
export const storeTrustedDevice = async (fingerprint: string): Promise<void> => {
  const data: TrustedDeviceData = {
    fingerprint,
    expires: Date.now() + THIRTY_DAYS_MS,
  };
  
  const jsonData = JSON.stringify(data);
  
  // Try native vault first (persists across reinstalls)
  if (isDespia()) {
    await setVaultItem(TRUSTED_DEVICE_KEY, jsonData, false);
  }
  
  // Always store in localStorage as backup
  localStorage.setItem(TRUSTED_DEVICE_KEY, jsonData);
};

/**
 * Get the trusted device fingerprint if not expired
 * Checks native vault first on Despia, then localStorage
 * Automatically clears expired entries
 */
export const getTrustedDevice = async (): Promise<string | null> => {
  let stored: string | null = null;
  
  // Try native vault first on Despia
  if (isDespia()) {
    stored = await getVaultItem(TRUSTED_DEVICE_KEY);
  }
  
  // Fallback to localStorage
  if (!stored) {
    stored = localStorage.getItem(TRUSTED_DEVICE_KEY);
  }
  
  if (!stored) return null;

  try {
    const data: TrustedDeviceData = JSON.parse(stored);
    
    // Check if expired
    if (Date.now() > data.expires) {
      localStorage.removeItem(TRUSTED_DEVICE_KEY);
      return null;
    }
    
    return data.fingerprint;
  } catch {
    // Invalid data format, clear it
    localStorage.removeItem(TRUSTED_DEVICE_KEY);
    return null;
  }
};

/**
 * Clear the trusted device from both vault and localStorage
 */
export const clearTrustedDevice = async (): Promise<void> => {
  // Clear from native vault if on Despia
  if (isDespia()) {
    await setVaultItem(TRUSTED_DEVICE_KEY, '', false);
  }
  localStorage.removeItem(TRUSTED_DEVICE_KEY);
};

/**
 * Check if current device fingerprint matches stored trusted device
 */
export const isTrustedDevice = async (currentFingerprint: string): Promise<boolean> => {
  const stored = await getTrustedDevice();
  return stored !== null && stored === currentFingerprint;
};
