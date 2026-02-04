import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';
import { copyToClipboard, isIOS } from '@/utils/clipboard';
import { CopyFallbackDialog } from '@/components/ui/CopyFallbackDialog';
import { toast } from 'sonner';
import { stripMarkdownCompact } from '@/utils/stripMarkdown';

interface CopySectionButtonProps {
  text: string | null;
  sectionTitle: string;
}

export function CopySectionButton({ text, sectionTitle }: CopySectionButtonProps) {
  const [copied, setCopied] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [fallbackText, setFallbackText] = useState('');

  const handleCopy = async () => {
    if (!text) return;

    const cleanText = stripMarkdownCompact(text);

    if (isIOS()) {
      setFallbackText(cleanText);
      setShowFallback(true);
      return;
    }

    const success = await copyToClipboard(cleanText);
    if (success) {
      setCopied(true);
      toast.success(`${sectionTitle} copied`);
      setTimeout(() => setCopied(false), 2000);
    } else {
      setFallbackText(cleanText);
      setShowFallback(true);
    }
  };

  if (!text) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          handleCopy();
        }}
        title={`Copy ${sectionTitle}`}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-600" />
        ) : (
          <Copy className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </Button>

      <CopyFallbackDialog
        open={showFallback}
        onOpenChange={setShowFallback}
        title={`Copy ${sectionTitle}`}
        text={fallbackText}
      />
    </>
  );
}
