import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FileText, Sparkles } from 'lucide-react';

interface AddTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddTemplateDialog({ open, onOpenChange }: AddTemplateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Create Template
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="p-3 rounded-full bg-primary/10 mb-4">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <h3 className="font-semibold text-lg mb-2">Coming Soon</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            Custom template creation will allow you to build personalized templates based on your clinic's needs.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
