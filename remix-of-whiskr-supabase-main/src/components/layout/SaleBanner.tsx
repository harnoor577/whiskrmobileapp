import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function SaleBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem('sale-banner-dismissed');
    if (!dismissed) {
      setIsVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('sale-banner-dismissed', 'true');
  };

  if (!isVisible) return null;

  return (
    <div className="bg-gradient-primary text-white py-3 px-4 relative">
      <div className="container mx-auto flex items-center justify-center gap-4">
        <p className="text-sm md:text-base font-medium text-center">
          🎉 Limited-time launch pricing: Basic $49/mo, Professional $97/mo — Save up to 38%!
        </p>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDismiss}
          className="absolute right-4 text-white hover:bg-white/20"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
