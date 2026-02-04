import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileImage, TestTube2 } from "lucide-react";

interface DiagnosticTypeDialogProps {
  open: boolean;
  onClose: () => void;
  onSelectType: (type: 'imaging' | 'bloodwork') => void;
}

export function DiagnosticTypeDialog({ open, onClose, onSelectType }: DiagnosticTypeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Select Diagnostic Type</DialogTitle>
          <DialogDescription>
            Choose the type of diagnostic file you want to upload
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Button
            onClick={() => {
              onSelectType('imaging');
              onClose();
            }}
            variant="outline"
            className="h-auto py-6 flex flex-col items-center gap-3 hover:bg-accent"
          >
            <FileImage className="h-8 w-8 text-primary" />
            <div className="text-center">
              <div className="font-semibold text-base">Imaging</div>
              <div className="text-sm text-muted-foreground">X-rays, Ultrasounds</div>
            </div>
          </Button>
          
          <Button
            onClick={() => {
              onSelectType('bloodwork');
              onClose();
            }}
            variant="outline"
            className="h-auto py-6 flex flex-col items-center gap-3 hover:bg-accent"
          >
            <TestTube2 className="h-8 w-8 text-primary" />
            <div className="text-center">
              <div className="font-semibold text-base">Bloodwork Results</div>
              <div className="text-sm text-muted-foreground">CBC, Chemistry Panel, Urinalysis</div>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
