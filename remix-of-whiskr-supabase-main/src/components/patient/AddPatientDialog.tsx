import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus } from 'lucide-react';

export function AddPatientDialog() {
  const navigate = useNavigate();
  const { clinicId } = useAuth();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    species: '',
    breed: '',
    sex: '',
    age: '',
    patientId: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    if (!formData.patientId || !formData.species || !formData.age || 
        !formData.breed || !formData.sex) {
      toast({
        title: 'Missing required fields',
        description: 'Patient ID, Species, Age, Breed, and Sex are required',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      // Create default owner
      const { data: owner, error: ownerError } = await supabase
        .from('owners')
        .insert({
          clinic_id: clinicId,
          name: 'Unknown Owner',
        })
        .select()
        .single();

      if (ownerError) throw ownerError;

      // Create patient
      const { data: patient, error: patientError } = await supabase
        .from('patients')
        .insert({
          clinic_id: clinicId,
          owner_id: owner.id,
          name: formData.name || 'Unknown',
          species: formData.species,
          breed: formData.breed,
          sex: formData.sex,
          date_of_birth: formData.age ? 
            new Date(new Date().getFullYear() - parseInt(formData.age), 0, 1).toISOString() : 
            null,
          identifiers: { patient_id: formData.patientId.trim() },
        })
        .select()
        .single();

      if (patientError) throw patientError;

      toast({
        title: 'Patient added successfully',
        description: 'The patient record has been created',
      });

      setDialogOpen(false);
      setFormData({
        name: '',
        species: '',
        breed: '',
        sex: '',
        age: '',
        patientId: '',
      });
      
      // Navigate to patient detail page
      navigate(`/patients/${patient.id}`);
    } catch (error: any) {
      console.error('Error adding patient:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to add patient',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Add New Patient
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Patient</DialogTitle>
          <DialogDescription>
            Fill in the patient information. All fields marked with * are required.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="patientId">Patient ID / Chart Number *</Label>
              <Input
                id="patientId"
                placeholder="e.g., 1234"
                value={formData.patientId}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9]/g, '');
                  setFormData({ ...formData, patientId: value });
                }}
                required
              />
              <p className="text-xs text-muted-foreground">
                Numbers only - no letters or special characters
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Patient Name</Label>
              <Input
                id="name"
                placeholder="e.g., Max, Bella"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="species">Species *</Label>
              <Select
                value={formData.species}
                onValueChange={(value) => setFormData({ ...formData, species: value })}
                required
              >
                <SelectTrigger id="species">
                  <SelectValue placeholder="Select species" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Canine">Canine (Dog)</SelectItem>
                  <SelectItem value="Feline">Feline (Cat)</SelectItem>
                  <SelectItem value="Avian">Avian (Bird)</SelectItem>
                  <SelectItem value="Equine">Equine (Horse)</SelectItem>
                  <SelectItem value="Bovine">Bovine (Cow)</SelectItem>
                  <SelectItem value="Caprine">Caprine (Goat)</SelectItem>
                  <SelectItem value="Ovine">Ovine (Sheep)</SelectItem>
                  <SelectItem value="Porcine">Porcine (Pig)</SelectItem>
                  <SelectItem value="Reptile">Reptile</SelectItem>
                  <SelectItem value="Small Mammal">Small Mammal</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="breed">Breed *</Label>
              <Input
                id="breed"
                placeholder="e.g., Labrador, Siamese"
                value={formData.breed}
                onChange={(e) => setFormData({ ...formData, breed: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sex">Sex *</Label>
              <Select
                value={formData.sex}
                onValueChange={(value) => setFormData({ ...formData, sex: value })}
                required
              >
                <SelectTrigger id="sex">
                  <SelectValue placeholder="Select sex" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Male (Neutered)">Male (Neutered)</SelectItem>
                  <SelectItem value="Female (Spayed)">Female (Spayed)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="age">Age (years) *</Label>
              <Input
                id="age"
                type="number"
                placeholder="e.g., 3"
                value={formData.age}
                onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Patient'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
