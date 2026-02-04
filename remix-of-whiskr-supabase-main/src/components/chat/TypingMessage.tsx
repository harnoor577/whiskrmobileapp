import { useState, useEffect } from 'react';
import { FormattedMessage } from './FormattedMessage';

interface TypingMessageProps {
  content: string;
  speed?: number;
}

export function TypingMessage({ content, speed = 4 }: TypingMessageProps) {
  const [displayedContent, setDisplayedContent] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (content.length === 0) {
      setIsComplete(true);
      return;
    }

    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex < content.length) {
        setDisplayedContent(content.slice(0, currentIndex + 1));
        currentIndex++;
      } else {
        setIsComplete(true);
        clearInterval(interval);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [content, speed]);

  if (isComplete) {
    return <FormattedMessage content={content} />;
  }

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <p className="whitespace-pre-wrap">{displayedContent}</p>
      <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1" />
    </div>
  );
}
