import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowLeft, Save, AlertCircle, User, Calendar, Stethoscope } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format } from "date-fns";

export default function PatientForm() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const { clinicId } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [duplicatePatient, setDuplicatePatient] = useState<any>(null);
  const [lastConsult, setLastConsult] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    species: "",
    breed: "",
    sex: "",
    age: "",
    alerts: "",
    patientId: "", // External patient ID
  });

  useEffect(() => {
    if (clinicId && patientId) {
      fetchPatient();
    }
  }, [clinicId, patientId]);

  const fetchPatient = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("patients")
        .select("*")
        .eq("id", patientId)
        .eq("clinic_id", clinicId)
        .single();

      if (error) throw error;
      
      // Calculate age from date of birth if it exists
      let ageValue = "";
      if (data.date_of_birth) {
        const birth = new Date(data.date_of_birth);
        const today = new Date();
        const years = today.getFullYear() - birth.getFullYear();
        ageValue = years.toString();
      }
      
      // Extract patient_id from identifiers
      const patientIdValue = (data.identifiers as any)?.patient_id || "";
      
      setFormData({
        name: data.name || "",
        species: data.species || "",
        breed: data.breed || "",
        sex: data.sex || "",
        age: ageValue,
        alerts: data.alerts || "",
        patientId: patientIdValue,
      });
    } catch (error) {
      console.error("Error fetching patient:", error);
      toast({
        title: "Error",
        description: "Failed to load patient data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateDateOfBirth = (age: string): string | null => {
    const ageNum = parseInt(age);
    if (isNaN(ageNum) || ageNum < 0) return null;
    
    const today = new Date();
    const birthYear = today.getFullYear() - ageNum;
    return `${birthYear}-01-01`;
  };

  const checkDuplicatePatientId = async (patientIdValue: string) => {
    if (!patientIdValue.trim()) {
      setDuplicatePatient(null);
      setLastConsult(null);
      return;
    }
    
    setCheckingDuplicate(true);
    try {
      const { data: existingPatient, error } = await supabase
        .from('patients')
        .select('id, name, species, breed, date_of_birth')
        .eq('clinic_id', clinicId)
        .eq('identifiers->>patient_id', patientIdValue.trim())
        .maybeSingle();
      
      if (error) throw error;
      
      // If we're editing and found a match, check if it's the same patient
      if (existingPatient && patientId && existingPatient.id === patientId) {
        setDuplicatePatient(null);
        setLastConsult(null);
        return;
      }
      
      if (existingPatient) {
        setDuplicatePatient(existingPatient);
        
        // Fetch last consult for this patient
        const { data: consult } = await supabase
          .from('consults')
          .select('id, started_at, status')
          .eq('patient_id', existingPatient.id)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        setLastConsult(consult);
      } else {
        setDuplicatePatient(null);
        setLastConsult(null);
      }
    } catch (error) {
      console.error('Error checking duplicate:', error);
      setDuplicatePatient(null);
      setLastConsult(null);
    } finally {
      setCheckingDuplicate(false);
    }
  };
  
  // Debounced check for duplicate patient ID
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.patientId) {
        checkDuplicatePatientId(formData.patientId);
      } else {
        setDuplicatePatient(null);
        setLastConsult(null);
      }
    }, 500);
    
    return () => clearTimeout(timer);
  }, [formData.patientId]);
  
  const calculateAge = (dateOfBirth: string | null): string => {
    if (!dateOfBirth) return "Unknown";
    const birth = new Date(dateOfBirth);
    const today = new Date();
    const years = today.getFullYear() - birth.getFullYear();
    const months = today.getMonth() - birth.getMonth();
    
    if (years === 0) {
      return `${months} month${months !== 1 ? 's' : ''}`;
    }
    return `${years} year${years !== 1 ? 's' : ''}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields: Patient ID, Species, Age, Breed, Sex
    if (!formData.patientId || !formData.species || !formData.age || 
        !formData.breed || !formData.sex) {
      toast({
        title: "Missing required fields",
        description: "Patient ID, Species, Age, Breed, and Sex are required",
        variant: "destructive",
      });
      return;
    }

    // Prevent submission if duplicate patient exists
    if (duplicatePatient) {
      toast({
        title: "Duplicate Patient ID",
        description: `This Patient ID already exists. Please use the existing patient or enter a different ID.`,
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);

      // Handle owner - create default or use existing
      let ownerId;
      
      if (patientId) {
        // For editing, get existing owner_id
        const { data: existingPatient } = await supabase
          .from("patients")
          .select("owner_id")
          .eq("id", patientId)
          .eq("clinic_id", clinicId)
          .single();
        
        ownerId = existingPatient?.owner_id;
      } else {
        // For new patients, create a default owner
        const { data: newOwner, error: ownerError } = await supabase
          .from("owners")
          .insert([{ 
            name: "Unknown Owner", 
            clinic_id: clinicId 
          }])
          .select("id")
          .single();

        if (ownerError) throw ownerError;
        ownerId = newOwner.id;
      }

      const patientData = {
        name: formData.name || null,
        species: formData.species,
        breed: formData.breed || null,
        sex: formData.sex || null,
        date_of_birth: formData.age ? calculateDateOfBirth(formData.age) : null,
        alerts: formData.alerts || null,
        identifiers: formData.patientId.trim() 
          ? { patient_id: formData.patientId.trim() } 
          : {},
        owner_id: ownerId,
        clinic_id: clinicId,
      };

      let savedPatientId = patientId;

      if (patientId) {
        // Update existing patient
        const { error } = await supabase
          .from("patients")
          .update(patientData)
          .eq("id", patientId)
          .eq("clinic_id", clinicId);

        if (error) throw error;
      } else {
        // Create new patient
        const { data, error } = await supabase
          .from("patients")
          .insert([patientData])
          .select()
          .single();

        if (error) throw error;
        savedPatientId = data.id;
      }

      toast({
        title: "Success",
        description: patientId ? "Patient updated successfully" : "Patient created successfully",
      });
      navigate(`/patients/${savedPatientId}`);
    } catch (error: any) {
      console.error("Error saving patient:", error);
      
      // Check if it's a duplicate patient ID error from database
      const errorMessage = error?.message || '';
      if (errorMessage.includes('already exists in this clinic')) {
        toast({
          title: "Duplicate Patient ID",
          description: errorMessage,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to save patient",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8 max-w-2xl">
      <Button variant="ghost" onClick={() => navigate("/patients")} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Patients
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>{patientId ? "Edit Patient" : "Add New Patient"}</CardTitle>
          <CardDescription>
            {patientId ? "Update patient information" : "Create a new patient record"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="patientId">Patient ID *</Label>
              <Input
                id="patientId"
                value={formData.patientId}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9]/g, '');
                  setFormData({ ...formData, patientId: value });
                }}
                placeholder="e.g., 12345"
                disabled={checkingDuplicate}
                className={duplicatePatient ? "border-destructive" : ""}
                required
              />
              <p className="text-xs text-muted-foreground">
                Numbers only - no letters or special characters.
              </p>
              
              {/* Duplicate Patient Alert */}
              {duplicatePatient && (
                <Alert variant="destructive" className="mt-3">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-3">
                      <p className="font-semibold">This Patient ID already exists!</p>
                      
                      <Card className="border-border bg-card">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <User className="h-4 w-4" />
                            {duplicatePatient.name}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <span className="font-medium">Species:</span>
                            <span>{duplicatePatient.species}</span>
                          </div>
                          {duplicatePatient.breed && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <span className="font-medium">Breed:</span>
                              <span>{duplicatePatient.breed}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            <span className="font-medium">Age:</span>
                            <span>{calculateAge(duplicatePatient.date_of_birth)}</span>
                          </div>
                          {lastConsult && (
                            <div className="flex items-center gap-2 text-muted-foreground pt-2 border-t">
                              <Stethoscope className="h-3 w-3" />
                              <span className="font-medium">Last Consult:</span>
                              <span>{format(new Date(lastConsult.started_at), 'MMM dd, yyyy')}</span>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                      
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => navigate(`/patients/${duplicatePatient.id}`)}
                          className="flex-1"
                        >
                          View Patient
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            // Create consult for existing patient
                            navigate(`/patients/${duplicatePatient.id}`);
                          }}
                          className="flex-1"
                        >
                          Start Consult
                        </Button>
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Patient name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="species">Species *</Label>
                <Select
                  value={formData.species}
                  onValueChange={(value) => setFormData({ ...formData, species: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select species" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Dog">Dog</SelectItem>
                    <SelectItem value="Cat">Cat</SelectItem>
                    <SelectItem value="Bird">Bird</SelectItem>
                    <SelectItem value="Rabbit">Rabbit</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="breed">Breed *</Label>
                <Input
                  id="breed"
                  value={formData.breed}
                  onChange={(e) => setFormData({ ...formData, breed: e.target.value })}
                  placeholder="Breed"
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
                  <SelectTrigger>
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="age">Age (years) *</Label>
              <Input
                id="age"
                type="number"
                min="0"
                value={formData.age}
                onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                placeholder="Enter age in years"
                required
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    {patientId ? "Update Patient" : "Create Patient"}
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/patients")}
                disabled={loading}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
