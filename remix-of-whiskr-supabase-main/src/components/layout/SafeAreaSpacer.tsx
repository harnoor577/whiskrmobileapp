import { cn } from '@/lib/utils';

interface SafeAreaSpacerProps {
  position: 'top' | 'bottom';
  className?: string;
}

/**
 * Safe Area Spacer following Despia Native pattern
 * 
 * The Despia runtime automatically provides var(--safe-area-top) and var(--safe-area-bottom)
 * No npm package required - this feature is built into the native runtime
 * 
 * Usage: Add spacer divs at the top and bottom of your layout
 * - Top: Before header/navbar
 * - Bottom: After bottom navigation/menu bar
 */
export const SafeAreaSpacer = ({ position, className }: SafeAreaSpacerProps) => {
  const variable = position === 'top' ? 'var(--safe-area-top)' : 'var(--safe-area-bottom)';
  
  return (
    <div 
      className={cn(className)}
      style={{ height: variable }} 
    />
  );
};
