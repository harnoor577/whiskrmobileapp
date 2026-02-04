import { useRef } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

interface RecordingConsentDialogProps {
  open: boolean;
  onAgree: () => void;
  onCancel: () => void;
}

export function RecordingConsentDialog({ open, onAgree, onCancel }: RecordingConsentDialogProps) {
  const agreedRef = useRef(false);

  const handleAgree = () => {
    agreedRef.current = true;
    onAgree();
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen && !agreedRef.current) {
      onCancel();
    }
    if (!isOpen) {
      agreedRef.current = false;
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Recording Consent</AlertDialogTitle>
          <AlertDialogDescription>
            Disclaimer: This session is being recorded. By continuing, you acknowledge and consent to being recorded.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleAgree}>Agree</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
