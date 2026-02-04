import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import ReactMarkdown from 'react-markdown';
import { FeedbackButtons } from '@/components/feedback/FeedbackButtons';
import { copyToClipboard as copyToClipboardUtil, isIOS } from '@/utils/clipboard';
import { CopyFallbackDialog } from '@/components/ui/CopyFallbackDialog';
import { useIsMobile } from '@/hooks/use-mobile';

interface MessageSection {
  title: string;
  content: string;
}

interface FormattedMessageProps {
  content: string;
  consultId?: string;
}

export function FormattedMessage({ content, consultId }: FormattedMessageProps) {
  const { toast } = useToast();
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [copyDialogText, setCopyDialogText] = useState("");
  const [copyDialogTitle, setCopyDialogTitle] = useState("");

  // Parse the message into sections
  const parseMessage = (text: string): MessageSection[] => {
    const sections: MessageSection[] = [];
    
    // Common section headers
    const sectionHeaders = [
      'Clinical Summary',
      'Assessment',
      'Vitals',
      'Physical Examination',
      'PHYSICAL EXAM',
      'Initial Differentials',
      'Differential Diagnoses',
      'Diagnostic Plan',
      'Recommended Diagnostics',
      'Treatment Plan',
      'Prognosis',
      'Client Communication',
      'Working Diagnosis',
      'Updated Differentials'
    ];

    let remainingText = text;
    let lastIndex = 0;

    // Find all section headers
    const headerMatches: { header: string; index: number }[] = [];
    sectionHeaders.forEach(header => {
      // Match both markdown headers (##) and plain text headers
      const regex = new RegExp(`(##\\s*)?${header}`, 'gi');
      let match;
      while ((match = regex.exec(text)) !== null) {
        headerMatches.push({ header, index: match.index });
      }
    });

    // Sort by index
    headerMatches.sort((a, b) => a.index - b.index);

    // Extract sections
    for (let i = 0; i < headerMatches.length; i++) {
      const currentMatch = headerMatches[i];
      const nextMatch = headerMatches[i + 1];
      
      const startIndex = currentMatch.index;
      const endIndex = nextMatch ? nextMatch.index : text.length;
      
      const sectionText = text.substring(startIndex, endIndex).trim();
      // Remove both markdown headers (##) and plain text headers
      const contentWithoutHeader = sectionText.replace(/^(##\s*)?[^\n]+\n/, '').trim();
      
      if (contentWithoutHeader) {
        sections.push({
          title: currentMatch.header,
          content: contentWithoutHeader
        });
      }
    }

    // If no sections found, return the whole content as one section
    if (sections.length === 0) {
      return [{ title: 'Response', content: text }];
    }

    return sections;
  };

  const sections = parseMessage(content);

  // Map section titles to feedback content types
  const getFeedbackType = (sectionTitle: string): 'diagnosis' | 'treatment_plan' | 'soap_note' | null => {
    const title = sectionTitle.toLowerCase();
    if (title.includes('assessment') || title.includes('diagnosis') || title.includes('differential')) {
      return 'diagnosis';
    }
    if (title.includes('treatment') || title.includes('plan')) {
      return 'treatment_plan';
    }
    if (title.includes('soap') || title.includes('clinical summary')) {
      return 'soap_note';
    }
    return null;
  };

  const copyToClipboard = async (text: string, sectionTitle: string) => {
    const success = await copyToClipboardUtil(text);
    if (success) {
      setCopiedSection(sectionTitle);
      toast({
        title: 'Copied',
        description: `${sectionTitle} copied to clipboard`,
      });
      setTimeout(() => setCopiedSection(null), 2000);
    } else {
      // If copy failed on mobile, open fallback dialog
      if (isMobile || isIOS()) {
        setCopyDialogText(text);
        setCopyDialogTitle(`Copy ${sectionTitle}`);
        setShowCopyDialog(true);
      } else {
        toast({
          title: 'Error',
          description: 'Failed to copy to clipboard',
          variant: 'destructive',
        });
      }
    }
  };

  if (sections.length === 1 && sections[0].title === 'Response') {
    // Heuristic: treat email-like content as Client Communication
    const isEmailLike = /(^Subject:)|(^Hi\s+)|(^Dear\s+)/i.test(content.trim());
    const title = isEmailLike ? 'Client Communication' : 'Response';
    return (
      <Card className="p-4 bg-muted/30">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-semibold text-base text-primary">{title}</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => copyToClipboard(content, title)}
            className="h-7 px-2"
          >
            {copiedSection === title ? (
              <Check className="h-3 w-3 text-green-600" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
        </div>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3 animate-fade-in">
      {sections.map((section, index) => (
      <Card key={index} className="p-4 bg-muted/30">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="font-semibold text-base text-primary">{section.title}</h3>
            <div className="flex items-center gap-2">
              {getFeedbackType(section.title) && (
                <FeedbackButtons
                  contentType={getFeedbackType(section.title)!}
                  contentText={section.content}
                  consultId={consultId}
                />
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(section.content, section.title)}
                className="h-7 px-2"
              >
                {copiedSection === section.title ? (
                  <Check className="h-3 w-3 text-green-600" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </div>
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
            <ReactMarkdown>
              {section.content}
            </ReactMarkdown>
          </div>
        </Card>
      ))}

      {/* Copy Fallback Dialog for Mobile */}
      <CopyFallbackDialog
        open={showCopyDialog}
        onOpenChange={setShowCopyDialog}
        title={copyDialogTitle}
        text={copyDialogText}
      />
    </div>
  );
}
