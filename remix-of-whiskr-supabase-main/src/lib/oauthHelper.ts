import { isDespia, isIOS, isAndroid } from './despia';

/**
 * Gets the appropriate OAuth redirect URL based on the current platform.
 * 
 * For Despia native apps:
 * - iOS: Uses /auth/callback with deep-link return handling
 * - Android: Uses /auth/callback (must NOT be in assetlinks.json to prevent App Links interception)
 * 
 * For web browsers:
 * - Uses standard /auth/callback route
 */
export const getOAuthRedirectUrl = (): string => {
  const baseUrl = window.location.origin;
  const callbackPath = '/auth/callback';
  
  if (isDespia()) {
    console.log('[OAuth] Despia detected, platform:', isIOS() ? 'iOS' : isAndroid() ? 'Android' : 'unknown');
  }
  
  return `${baseUrl}${callbackPath}`;
};

/**
 * Gets platform info for debugging OAuth issues
 */
export const getOAuthPlatformInfo = (): {
  platform: 'ios' | 'android' | 'web';
  isNative: boolean;
  redirectUrl: string;
} => {
  return {
    platform: isIOS() ? 'ios' : isAndroid() ? 'android' : 'web',
    isNative: isDespia(),
    redirectUrl: getOAuthRedirectUrl(),
  };
};
