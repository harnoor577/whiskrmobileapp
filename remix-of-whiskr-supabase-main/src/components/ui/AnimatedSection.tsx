import { useScrollAnimation } from '@/hooks/use-scroll-animation';
import { cn } from '@/lib/utils';

interface AnimatedSectionProps {
  children: React.ReactNode;
  className?: string;
  animation?: 'fade-up' | 'fade-left' | 'fade-right' | 'scale' | 'stagger';
  delay?: number;
}

export const AnimatedSection = ({ 
  children, 
  className, 
  animation = 'fade-up',
  delay = 0 
}: AnimatedSectionProps) => {
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.1 });
  
  const animationClasses = {
    'fade-up': 'animate-on-scroll',
    'fade-left': 'animate-on-scroll-left',
    'fade-right': 'animate-on-scroll-right',
    'scale': 'animate-on-scroll-scale',
    'stagger': 'stagger-children',
  };

  return (
    <div 
      ref={ref} 
      className={cn(
        animationClasses[animation],
        isVisible && 'is-visible',
        className
      )}
      style={{ transitionDelay: delay ? `${delay}ms` : undefined }}
    >
      {children}
    </div>
  );
};
