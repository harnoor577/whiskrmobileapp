import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Pill, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { downloadMedicationPDF, type MedicationProfile } from '@/utils/medicationPdfGenerator';
import type { ExtractedMedication } from '@/utils/medicationExtractor';
import type { ClinicInfo } from '@/utils/pdfExport';

interface MedicineSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  medications: ExtractedMedication[];
  patient: { name?: string; species?: string; breed?: string | null } | null;
  clinic: ClinicInfo | null;
}

export function MedicineSelectorDialog({
  open,
  onOpenChange,
  medications,
  patient,
  clinic
}: MedicineSelectorDialogProps) {
  const [selectedMeds, setSelectedMeds] = useState<Set<string>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });
  const [currentMedName, setCurrentMedName] = useState('');

  const handleToggleMed = (medName: string) => {
    setSelectedMeds(prev => {
      const next = new Set(prev);
      if (next.has(medName)) {
        next.delete(medName);
      } else {
        next.add(medName);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedMeds(new Set(medications.map(m => m.name)));
  };

  const handleDeselectAll = () => {
    setSelectedMeds(new Set());
  };

  const handleDownloadSelected = async () => {
    if (selectedMeds.size === 0) {
      toast.error('Please select at least one medication');
      return;
    }

    setIsDownloading(true);
    const selectedArray = Array.from(selectedMeds);
    let successCount = 0;

    for (let i = 0; i < selectedArray.length; i++) {
      const medName = selectedArray[i];
      setDownloadProgress({ current: i + 1, total: selectedArray.length });
      setCurrentMedName(medName);

      try {
        const { data, error } = await supabase.functions.invoke('generate-medication-profile', {
          body: {
            drugName: medName,
            patientInfo: patient ? {
              species: patient.species,
              breed: patient.breed
            } : undefined
          }
        });

        if (error) {
          console.error(`Error generating profile for ${medName}:`, error);
          continue;
        }

        if (data?.profile) {
          downloadMedicationPDF(
            data.profile as MedicationProfile,
            clinic,
            patient ? { name: patient.name || '', species: patient.species, breed: patient.breed } : null
          );
          successCount++;
        }

        // Small delay to prevent browser blocking multiple downloads
        if (i < selectedArray.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 400));
        }
      } catch (err) {
        console.error(`Error processing ${medName}:`, err);
      }
    }

    setIsDownloading(false);
    setDownloadProgress({ current: 0, total: 0 });
    setCurrentMedName('');

    if (successCount > 0) {
      toast.success(`Downloaded ${successCount} medication profile${successCount > 1 ? 's' : ''}`);
      onOpenChange(false);
      setSelectedMeds(new Set());
    } else {
      toast.error('Failed to download medication profiles');
    }
  };

  const progressPercent = downloadProgress.total > 0 
    ? (downloadProgress.current / downloadProgress.total) * 100 
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pill className="h-5 w-5 text-primary" />
            {isDownloading ? 'Downloading Medication Profiles...' : 'Select Medications to Download'}
          </DialogTitle>
        </DialogHeader>

        {isDownloading ? (
          <div className="py-8 space-y-4">
            <div className="text-center space-y-2">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="text-sm text-muted-foreground">
                Downloading {downloadProgress.current} of {downloadProgress.total}...
              </p>
              <p className="font-medium">{currentMedName}</p>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>
        ) : (
          <>
            <div className="flex gap-2 mb-3">
              <Button variant="outline" size="sm" onClick={handleSelectAll}>
                Select All
              </Button>
              <Button variant="outline" size="sm" onClick={handleDeselectAll}>
                Deselect All
              </Button>
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {medications.map((med) => (
                <label
                  key={med.name}
                  className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    checked={selectedMeds.has(med.name)}
                    onCheckedChange={() => handleToggleMed(med.name)}
                  />
                  <span className="flex-1">{med.name}</span>
                </label>
              ))}
            </div>

            <DialogFooter className="mt-4 gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleDownloadSelected}
                disabled={selectedMeds.size === 0}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Download {selectedMeds.size > 0 ? `${selectedMeds.size} Selected` : 'Selected'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
