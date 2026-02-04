/**
 * Utility functions for consult-scoped sessionStorage operations
 * Prevents data contamination between different consults
 */

// Keys that should be scoped to consultId
const SCOPED_KEYS = [
  'pendingTranscription',
  'pendingFormData',
  'pendingRecording',
  'pendingRecordingDuration',
  'pendingSOAPData',
  'generated_soap_data',
  'generated_wellness_data',
  'generated_procedure_data',
  'uploadedDiagnosticsCount',
  'inputMode',
  'parsedPatientInfo',
  'newlyCreatedPatientId'
];

/**
 * Get a scoped key for sessionStorage
 */
export function getScopedKey(key: string, consultId: string): string {
  return `${key}_${consultId}`;
}

/**
 * Set a value in sessionStorage with consultId scope
 */
export function setConsultStorage(key: string, value: string, consultId: string): void {
  sessionStorage.setItem(getScopedKey(key, consultId), value);
}

/**
 * Get a value from sessionStorage with consultId scope
 * Falls back to unscoped key for migration purposes
 */
export function getConsultStorage(key: string, consultId: string): string | null {
  // Try scoped key first
  const scopedValue = sessionStorage.getItem(getScopedKey(key, consultId));
  if (scopedValue !== null) {
    return scopedValue;
  }
  
  // Fallback to legacy unscoped key (for migration)
  const unscopedValue = sessionStorage.getItem(key);
  if (unscopedValue !== null) {
    // Migrate to scoped key and remove unscoped
    sessionStorage.setItem(getScopedKey(key, consultId), unscopedValue);
    sessionStorage.removeItem(key);
    return unscopedValue;
  }
  
  return null;
}

/**
 * Remove a value from sessionStorage with consultId scope
 */
export function removeConsultStorage(key: string, consultId: string): void {
  sessionStorage.removeItem(getScopedKey(key, consultId));
  // Also remove legacy unscoped key
  sessionStorage.removeItem(key);
}

/**
 * Clear all stale consult data when entering a new consult
 * Removes data from other consults and legacy unscoped keys
 */
export function clearStaleConsultData(currentConsultId: string): void {
  // Remove all legacy unscoped keys
  SCOPED_KEYS.forEach(key => {
    sessionStorage.removeItem(key);
  });
  
  // Remove data from other consults
  const keysToRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (!key) continue;
    
    for (const prefix of SCOPED_KEYS) {
      if (key.startsWith(`${prefix}_`) && !key.endsWith(`_${currentConsultId}`)) {
        keysToRemove.push(key);
        break;
      }
    }
  }
  
  keysToRemove.forEach(key => sessionStorage.removeItem(key));
}

/**
 * Validate that pre-generated data is for the correct consult
 */
export function validatePreGeneratedData(data: any, expectedConsultId: string): boolean {
  // If data has consultId field, validate it matches
  if (data?.consultId && data.consultId !== expectedConsultId) {
    console.warn(`Pre-generated data consultId mismatch: expected ${expectedConsultId}, got ${data.consultId}`);
    return false;
  }
  return true;
}

/**
 * Store generated report data with consultId embedded
 */
export function storeGeneratedData(type: 'soap' | 'wellness' | 'procedure', data: any, consultId: string): void {
  const dataWithConsultId = {
    ...data,
    consultId
  };
  setConsultStorage(`generated_${type}_data`, JSON.stringify(dataWithConsultId), consultId);
}

/**
 * Get generated report data and validate consultId
 */
export function getGeneratedData(type: 'soap' | 'wellness' | 'procedure', consultId: string): any | null {
  const dataStr = getConsultStorage(`generated_${type}_data`, consultId);
  if (!dataStr) return null;
  
  try {
    const parsed = JSON.parse(dataStr);
    if (!validatePreGeneratedData(parsed, consultId)) {
      // Invalid data for this consult - remove it
      removeConsultStorage(`generated_${type}_data`, consultId);
      return null;
    }
    return parsed;
  } catch (e) {
    console.error(`Error parsing generated_${type}_data:`, e);
    return null;
  }
}
