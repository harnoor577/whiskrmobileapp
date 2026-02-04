import { useRef, useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { CopySectionButton } from '@/components/consult/CopySectionButton';
import { RegenerateSectionButton } from '@/components/consult/RegenerateSectionButton';
import { HighlightedContent, stripAbnormalMarkers } from './HighlightedContent';

interface SOAPSectionProps {
  title: string;
  content: string;
  onChange: (value: string) => void;
  isGenerating?: boolean;
  onRegenerate?: (instruction: string) => Promise<void>;
  isRegenerating?: boolean;
}

export function SOAPSection({
  title,
  content,
  onChange,
  isGenerating = false,
  onRegenerate,
  isRegenerating = false,
}: SOAPSectionProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Auto-resize textarea to fit content - consolidated to avoid forced reflows
  useEffect(() => {
    if (!isEditing) return;
    
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    // Use a single requestAnimationFrame to batch layout reads/writes
    const rafId = requestAnimationFrame(() => {
      const minHeight = window.innerWidth < 768 ? 120 : 200;
      textarea.style.height = 'auto';
      textarea.style.minHeight = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const newHeight = Math.max(minHeight, scrollHeight);
      textarea.style.height = `${newHeight}px`;
      textarea.style.minHeight = `${newHeight}px`;
    });
    
    return () => cancelAnimationFrame(rafId);
  }, [content, isEditing]);

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditing]);

  const getSectionColor = (sectionTitle: string) => {
    switch (sectionTitle.toLowerCase()) {
      case 'subjective':
        return 'border-l-blue-500';
      case 'objective':
        return 'border-l-green-500';
      case 'assessment':
        return 'border-l-amber-500';
      case 'plan':
        return 'border-l-purple-500';
      default:
        return 'border-l-primary';
    }
  };

  // Get clean content for copy button (without [[]] markers)
  const cleanContent = stripAbnormalMarkers(content);

  if (isGenerating || isRegenerating) {
    return (
      <Card className={`border-l-4 ${getSectionColor(title)}`}>
        <CardHeader className="px-3 md:px-6 py-2 md:pb-2">
          <CardTitle className="text-base md:text-lg font-semibold">{title}</CardTitle>
        </CardHeader>
        <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
          <div className="space-y-2 min-h-[120px] md:min-h-[180px]">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`border-l-4 ${getSectionColor(title)}`}>
      <CardHeader className="px-3 md:px-6 py-2 md:pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base md:text-lg font-semibold">{title}</CardTitle>
          <div className="flex items-center gap-1">
            {onRegenerate && (
              <RegenerateSectionButton
                sectionTitle={title}
                onRegenerate={onRegenerate}
                disabled={isGenerating || isRegenerating}
              />
            )}
            <CopySectionButton text={cleanContent} sectionTitle={title} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
        {isEditing ? (
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => setIsEditing(false)}
            placeholder={`Enter ${title.toLowerCase()} notes...`}
            className="resize-none border-none bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-foreground leading-relaxed text-sm md:text-base min-h-[120px] md:min-h-[200px]"
          />
        ) : (
          <div 
            onClick={() => setIsEditing(true)}
            className="cursor-text min-h-[120px] md:min-h-[200px] text-sm md:text-base text-foreground"
          >
            {content ? (
              <HighlightedContent content={content} />
            ) : (
              <span className="text-muted-foreground">Click to enter {title.toLowerCase()} notes...</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
