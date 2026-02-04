import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface PatientData {
  id: string;
  name: string;
  species: string;
  breed?: string;
  sex?: string;
  age?: string;
  dateOfBirth?: string;
  identifiers?: { patient_id?: string };
}

interface EditPatientBasicDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient: PatientData | null;
  onPatientUpdated: () => void;
}

const speciesOptions = ['Canine', 'Feline', 'Avian', 'Reptile', 'Small Mammal', 'Equine', 'Bovine', 'Other'];
const sexOptions = ['Male', 'Female', 'Male (Intact)', 'Male (Neutered)', 'Female (Intact)', 'Female (Spayed)', 'Unknown'];

export function EditPatientBasicDialog({ open, onOpenChange, patient, onPatientUpdated }: EditPatientBasicDialogProps) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    species: '',
    breed: '',
    sex: '',
    age: '',
    patientId: '',
  });

  useEffect(() => {
    if (patient && open) {
      setFormData({
        name: patient.name || '',
        species: patient.species || '',
        breed: patient.breed || '',
        sex: patient.sex || '',
        age: patient.age || '',
        patientId: patient.identifiers?.patient_id || '',
      });
    }
  }, [patient, open]);

  const handleSave = async () => {
    if (!patient?.id) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('patients')
        .update({
          name: formData.name,
          species: formData.species,
          breed: formData.breed || null,
          sex: formData.sex || null,
          age: formData.age || null,
          identifiers: formData.patientId.trim() 
            ? { patient_id: formData.patientId.trim() } 
            : null,
        })
        .eq('id', patient.id);

      if (error) throw error;

      toast({ title: 'Patient info updated' });
      onPatientUpdated();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating patient:', error);
      toast({ title: 'Failed to update patient', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Patient Details</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="patientId">Patient ID</Label>
            <Input
              id="patientId"
              value={formData.patientId}
              onChange={(e) => setFormData(prev => ({ ...prev, patientId: e.target.value }))}
              placeholder="External patient ID (optional)"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Patient name"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="species">Species</Label>
              <Select value={formData.species} onValueChange={(v) => setFormData(prev => ({ ...prev, species: v }))}>
                <SelectTrigger id="species">
                  <SelectValue placeholder="Select species" />
                </SelectTrigger>
                <SelectContent>
                  {speciesOptions.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="breed">Breed</Label>
              <Input
                id="breed"
                value={formData.breed}
                onChange={(e) => setFormData(prev => ({ ...prev, breed: e.target.value }))}
                placeholder="Breed"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sex">Sex</Label>
              <Select value={formData.sex} onValueChange={(v) => setFormData(prev => ({ ...prev, sex: v }))}>
                <SelectTrigger id="sex">
                  <SelectValue placeholder="Select sex" />
                </SelectTrigger>
                <SelectContent>
                  {sexOptions.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="age">Age</Label>
              <Input
                id="age"
                value={formData.age}
                onChange={(e) => setFormData(prev => ({ ...prev, age: e.target.value }))}
                placeholder="e.g., 3 years"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !formData.name || !formData.species}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
