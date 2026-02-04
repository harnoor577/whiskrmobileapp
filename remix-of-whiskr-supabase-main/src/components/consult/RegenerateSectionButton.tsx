import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { RefreshCw, Loader2 } from 'lucide-react';

interface RegenerateSectionButtonProps {
  sectionTitle: string;
  onRegenerate: (instruction: string) => Promise<void>;
  disabled?: boolean;
}

export function RegenerateSectionButton({
  sectionTitle,
  onRegenerate,
  disabled = false,
}: RegenerateSectionButtonProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customInstruction, setCustomInstruction] = useState('');

  const quickActions = [
    { label: 'More detailed', instruction: 'Make this section more detailed and comprehensive' },
    { label: 'More concise', instruction: 'Make this section more concise and brief' },
    { label: 'Professional tone', instruction: 'Rewrite this section in a more professional clinical tone' },
    { label: 'Simpler language', instruction: 'Simplify this section for easier understanding by pet owners' },
  ];

  const handleQuickAction = async (instruction: string) => {
    setIsLoading(true);
    try {
      await onRegenerate(instruction);
      setOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomRegenerate = async () => {
    if (!customInstruction.trim()) return;
    setIsLoading(true);
    try {
      await onRegenerate(customInstruction);
      setOpen(false);
      setShowCustomInput(false);
      setCustomInstruction('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setShowCustomInput(false);
      setCustomInstruction('');
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          disabled={disabled || isLoading}
          title={`Regenerate ${sectionTitle}`}
          onClick={(e) => e.stopPropagation()}
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-64 p-3" 
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">
            Regenerate {sectionTitle}
          </p>
          
          {!showCustomInput ? (
            <>
              <div className="space-y-1.5">
                {quickActions.map((action) => (
                  <Button
                    key={action.label}
                    variant="ghost"
                    size="sm"
                    disabled={isLoading}
                    onClick={() => handleQuickAction(action.instruction)}
                    className="w-full justify-start text-sm h-8"
                  >
                    {isLoading ? (
                      <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                    ) : null}
                    {action.label}
                  </Button>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => setShowCustomInput(true)}
              >
                + Custom instruction
              </Button>
            </>
          ) : (
            <div className="space-y-2">
              <Textarea
                value={customInstruction}
                onChange={(e) => setCustomInstruction(e.target.value)}
                placeholder="Describe how you want to change this section..."
                className="min-h-[60px] text-sm resize-none"
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    setShowCustomInput(false);
                    setCustomInstruction('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="flex-1 gap-1"
                  onClick={handleCustomRegenerate}
                  disabled={!customInstruction.trim() || isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  Apply
                </Button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
