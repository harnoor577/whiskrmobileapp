import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { copyToClipboard } from "@/utils/clipboard";
import { useEffect, useRef } from "react";

interface CopyFallbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  text: string;
}

export function CopyFallbackDialog({ open, onOpenChange, title, text }: CopyFallbackDialogProps) {
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-select textarea content when dialog opens
  useEffect(() => {
    if (open && textareaRef.current) {
      // Small delay to ensure textarea is rendered
      setTimeout(() => {
        textareaRef.current?.select();
      }, 100);
    }
  }, [open]);

  const handleCopy = async () => {
    const success = await copyToClipboard(text);
    if (success) {
      toast({
        title: "Copied!",
        description: `${title} copied to clipboard`,
      });
      onOpenChange(false);
    } else {
      toast({
        title: "Copy Failed",
        description: "Please select all text and use your device's copy option",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Tap the Copy button below, or select all text and use your device's copy option.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Textarea
            ref={textareaRef}
            value={text}
            readOnly
            className="min-h-[300px] font-mono text-xs"
          />
          <div className="flex gap-2">
            <Button onClick={handleCopy} className="flex-1">
              <Copy className="h-4 w-4 mr-2" />
              Copy to Clipboard
            </Button>
            <Button onClick={() => onOpenChange(false)} variant="outline" className="flex-1">
              Close
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            💡 Tip: On iPhone, if the Copy button doesn't work, tap and hold the text above and select Copy.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
