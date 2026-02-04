import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Building2 } from 'lucide-react';

interface Clinic {
  id: string;
  name: string;
}

interface ClinicSelectorProps {
  open: boolean;
  clinics: Clinic[];
  onSelect: (clinicId: string) => void;
}

export function ClinicSelector({ open, clinics, onSelect }: ClinicSelectorProps) {
  const [selectedClinic, setSelectedClinic] = useState<string>(clinics[0]?.id || '');

  const handleContinue = () => {
    if (selectedClinic) {
      onSelect(selectedClinic);
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Select Clinic
          </DialogTitle>
          <DialogDescription>
            You belong to multiple clinics. Please select which clinic you'd like to access.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <RadioGroup value={selectedClinic} onValueChange={setSelectedClinic}>
            {clinics.map((clinic) => (
              <div key={clinic.id} className="flex items-center space-x-2">
                <RadioGroupItem value={clinic.id} id={clinic.id} />
                <Label htmlFor={clinic.id} className="flex-1 cursor-pointer">
                  {clinic.name}
                </Label>
              </div>
            ))}
          </RadioGroup>
          <Button onClick={handleContinue} className="w-full" disabled={!selectedClinic}>
            Continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
