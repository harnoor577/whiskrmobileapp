import FingerprintJS from '@fingerprintjs/fingerprintjs';

let fpPromise: Promise<any> | null = null;

// Initialize FingerprintJS once
export const initFingerprint = async () => {
  if (!fpPromise) {
    fpPromise = FingerprintJS.load();
  }
  return fpPromise;
};

// Get device fingerprint
export const getDeviceFingerprint = async (): Promise<string> => {
  try {
    console.log('[FINGERPRINT] Starting fingerprint generation...');
    const fp = await initFingerprint();
    const result = await fp.get();
    console.log('[FINGERPRINT] Fingerprint generated:', result.visitorId?.substring(0, 10) + '...');
    return result.visitorId;
  } catch (error) {
    console.error('[FINGERPRINT] Error getting device fingerprint:', error);
    // Fallback to a less reliable but still useful fingerprint
    const fallback = `fallback-${navigator.userAgent}-${window.screen.width}x${window.screen.height}`;
    console.log('[FINGERPRINT] Using fallback:', fallback.substring(0, 30) + '...');
    return fallback;
  }
};

// Get device name from user agent
export const getDeviceName = (): string => {
  const ua = navigator.userAgent;
  
  // Detect OS first (important for iOS detection)
  let os = 'Unknown OS';
  let deviceType = '';
  
  if (ua.includes('iPhone')) {
    os = 'iOS';
    deviceType = 'iPhone';
  } else if (ua.includes('iPad')) {
    os = 'iOS';
    deviceType = 'iPad';
  } else if (ua.includes('Android')) {
    os = 'Android';
    if (ua.includes('Mobile')) {
      deviceType = 'Phone';
    } else {
      deviceType = 'Tablet';
    }
  } else if (ua.includes('Windows')) {
    os = 'Windows';
  } else if (ua.includes('Macintosh') || ua.includes('Mac OS X')) {
    os = 'MacOS';
  } else if (ua.includes('Linux')) {
    os = 'Linux';
  }
  
  // Detect browser
  let browser = 'Unknown Browser';
  if (ua.includes('Edg')) {
    browser = 'Edge';
  } else if (ua.includes('Chrome') && !ua.includes('CriOS')) {
    browser = 'Chrome';
  } else if (ua.includes('CriOS')) {
    browser = 'Chrome';
  } else if (ua.includes('Firefox') || ua.includes('FxiOS')) {
    browser = 'Firefox';
  } else if (ua.includes('Safari') && !ua.includes('Chrome') && !ua.includes('CriOS')) {
    browser = 'Safari';
  }
  
  // Build device name
  if (deviceType) {
    return `${browser} on ${deviceType}`;
  }
  
  return `${browser} on ${os}`;
};

// Get client IP (requires backend support)
export const getClientIP = async (): Promise<string> => {
  try {
    console.log('[FINGERPRINT] Fetching client IP...');
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    console.log('[FINGERPRINT] IP fetched:', data.ip);
    return data.ip;
  } catch (error) {
    console.error('[FINGERPRINT] Error fetching IP:', error);
    return 'unknown';
  }
};