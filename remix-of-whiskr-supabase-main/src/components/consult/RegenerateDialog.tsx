import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { RefreshCw, Loader2 } from 'lucide-react';

interface RegenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRegenerate: (instruction: string) => void;
  isGenerating: boolean;
  reportType: 'SOAP' | 'Wellness' | 'Procedure';
}

const quickSuggestions = [
  { label: 'More detailed', instruction: 'Make the content more detailed and comprehensive' },
  { label: 'More concise', instruction: 'Make the content more concise and to the point' },
  { label: 'Simplify language', instruction: 'Use simpler, more accessible language' },
  { label: 'Add differentials', instruction: 'Add more differential diagnoses to consider' },
  { label: 'Expand treatment', instruction: 'Expand the treatment plan with more options' },
];

export function RegenerateDialog({
  open,
  onOpenChange,
  onRegenerate,
  isGenerating,
  reportType,
}: RegenerateDialogProps) {
  const [instruction, setInstruction] = useState('');

  const handleQuickSuggestion = (suggestionInstruction: string) => {
    setInstruction(suggestionInstruction);
  };

  const handleRegenerate = () => {
    if (instruction.trim()) {
      onRegenerate(instruction.trim());
      setInstruction('');
    }
  };

  const handleClose = () => {
    setInstruction('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            Regenerate {reportType} Notes
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            What changes would you like to make?
          </p>

          <div className="flex flex-wrap gap-2">
            {quickSuggestions.map((suggestion) => (
              <Button
                key={suggestion.label}
                variant="outline"
                size="sm"
                onClick={() => handleQuickSuggestion(suggestion.instruction)}
                className="text-xs"
              >
                {suggestion.label}
              </Button>
            ))}
          </div>

          <Textarea
            placeholder="Type your specific instructions for regeneration..."
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            className="min-h-[100px] resize-none"
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={isGenerating}>
            Cancel
          </Button>
          <Button
            onClick={handleRegenerate}
            disabled={!instruction.trim() || isGenerating}
            className="gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Regenerating...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Regenerate
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
