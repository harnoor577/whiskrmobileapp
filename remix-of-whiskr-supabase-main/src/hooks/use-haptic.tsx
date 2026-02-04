import { useCallback } from 'react';
import { haptic, isDespia, HapticType } from '@/lib/despia';

/**
 * React hook for haptic feedback
 * Provides easy access to haptic feedback in components
 */
export const useHaptic = () => {
  /**
   * Trigger haptic feedback
   * @param type - The type of haptic feedback (light, success, warning, error, heavy)
   */
  const triggerHaptic = useCallback((type: HapticType = 'light') => {
    haptic(type);
  }, []);

  /**
   * Create a click handler that triggers haptic feedback before calling the original handler
   */
  const withHaptic = useCallback(<T extends (...args: any[]) => any>(
    handler: T,
    type: HapticType = 'light'
  ) => {
    return (...args: Parameters<T>) => {
      triggerHaptic(type);
      return handler(...args);
    };
  }, [triggerHaptic]);

  return {
    triggerHaptic,
    withHaptic,
    isNativeApp: isDespia(),
  };
};
