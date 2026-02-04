import { useMemo } from 'react';

interface HighlightedContentProps {
  content: string;
  className?: string;
}

/**
 * Parses content for [[abnormal]] markers and renders them with red highlight.
 * Normal text stays as-is, abnormal values wrapped in [[...]] get bg-red-100 text-red-800
 */
export function HighlightedContent({ content, className = '' }: HighlightedContentProps) {
  const parsedContent = useMemo(() => {
    if (!content) return [];
    
    const parts: { text: string; isAbnormal: boolean }[] = [];
    const regex = /\[\[([^\]]+)\]\]/g;
    let lastIndex = 0;
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push({ text: content.slice(lastIndex, match.index), isAbnormal: false });
      }
      // Add the abnormal value (without brackets)
      parts.push({ text: match[1], isAbnormal: true });
      lastIndex = regex.lastIndex;
    }
    
    // Add remaining text after last match
    if (lastIndex < content.length) {
      parts.push({ text: content.slice(lastIndex), isAbnormal: false });
    }
    
    return parts;
  }, [content]);

  return (
    <div className={`whitespace-pre-wrap leading-relaxed ${className}`}>
      {parsedContent.map((part, index) => (
        part.isAbnormal ? (
          <span 
            key={index} 
            className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 rounded px-0.5"
          >
            {part.text}
          </span>
        ) : (
          <span key={index}>{part.text}</span>
        )
      ))}
    </div>
  );
}

/**
 * Strips [[...]] markers from content for clean text output (copy/download)
 */
export function stripAbnormalMarkers(content: string): string {
  return content.replace(/\[\[([^\]]+)\]\]/g, '$1');
}
