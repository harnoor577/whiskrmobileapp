import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, CheckCheck } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import ReactMarkdown from 'react-markdown';
import { FeedbackButtons } from '@/components/feedback/FeedbackButtons';
import { copyToClipboard, isIOS } from '@/utils/clipboard';
import { CopyFallbackDialog } from '@/components/ui/CopyFallbackDialog';
import { useIsMobile } from '@/hooks/use-mobile';

interface Message {
  role: 'user' | 'assistant' | 'case_note';
  content: string;
  created_at: string;
}

interface ConsolidatedResponseProps {
  messages: Message[];
  consultId?: string;
}

export function ConsolidatedResponse({ messages, consultId }: ConsolidatedResponseProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [copyDialogText, setCopyDialogText] = useState("");
  const [copyDialogTitle, setCopyDialogTitle] = useState("");

  // Filter only assistant messages and combine them
  const assistantMessages = messages
    .filter(msg => msg.role === 'assistant')
    .map(msg => msg.content)
    .join('\n\n');

  if (!assistantMessages) {
    return null;
  }

  const stripMarkdown = (text: string): string => {
    return text
      // Remove headers (##, ###, etc.)
      .replace(/^#{1,6}\s+/gm, '')
      // Remove bold/italic markers (**text**, *text*)
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      // Remove bullet points and convert to simple text
      .replace(/^[\s]*[-*+]\s+/gm, '• ')
      // Remove numbered list markers and keep numbers
      .replace(/^[\s]*\d+\.\s+/gm, '')
      // Clean up extra whitespace
      .replace(/\n\n\n+/g, '\n\n')
      .trim();
  };

  const copyToClipboardHandler = async () => {
    const cleanText = stripMarkdown(assistantMessages);
    const success = await copyToClipboard(cleanText);
    
    if (success) {
      setCopied(true);
      toast({
        title: "Copied!",
        description: "AI response copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } else {
      // If copy failed on mobile, open fallback dialog
      if (isMobile || isIOS()) {
        setCopyDialogText(cleanText);
        setCopyDialogTitle("Copy AI Response");
        setShowCopyDialog(true);
      } else {
        toast({
          title: "Failed to copy",
          description: "Could not copy to clipboard",
          variant: "destructive",
        });
      }
    }
  };

  return (
    <Card className="p-6 bg-card border-2 border-primary/20 relative">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-sm font-bold text-primary">AI</span>
        </div>
        <h3 className="font-semibold text-lg">whiskr AI Analysis</h3>
      </div>
      
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <ReactMarkdown
          components={{
            h2: ({ children }) => (
              <h2 className="text-lg font-bold mt-6 mb-3 text-foreground border-b-2 pb-2">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-base font-bold mt-4 mb-2 text-foreground border-b pb-1">
                {children}
              </h3>
            ),
            h4: ({ children }) => (
              <h4 className="text-sm font-semibold mt-3 mb-1 text-foreground">
                {children}
              </h4>
            ),
            p: ({ children }) => (
              <p className="text-sm leading-relaxed mb-2 text-foreground">
                {children}
              </p>
            ),
            ul: ({ children }) => (
              <ul className="list-disc pl-5 mb-3 space-y-1">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal pl-5 mb-3 space-y-1">
                {children}
              </ol>
            ),
            li: ({ children }) => (
              <li className="text-sm text-foreground">
                {children}
              </li>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-foreground">
                {children}
              </strong>
            ),
          }}
        >
          {assistantMessages}
        </ReactMarkdown>
      </div>
      
      <div className="flex justify-between items-center pt-4 mt-4 border-t">
        <FeedbackButtons
          contentType="diagnosis"
          contentText={assistantMessages}
          consultId={consultId}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={copyToClipboardHandler}
          className="gap-2"
        >
          {copied ? (
            <>
              <CheckCheck className="w-4 h-4 text-green-600" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>Copy All</span>
            </>
          )}
        </Button>
      </div>

      {/* Copy Fallback Dialog for Mobile */}
      <CopyFallbackDialog
        open={showCopyDialog}
        onOpenChange={setShowCopyDialog}
        title={copyDialogTitle}
        text={copyDialogText}
      />
    </Card>
  );
}
