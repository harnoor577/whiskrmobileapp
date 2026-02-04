import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { useConsultCreationGuard } from '@/hooks/use-consult-creation-guard';
import { supabase } from '@/integrations/supabase/client';
import { Plus, AlertCircle, User, Calendar, Stethoscope } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import { UpgradePlanModal } from '@/components/billing/UpgradePlanModal';
import { ConsultModeSelectionDialog } from './ConsultModeSelectionDialog';

// Normalize patient ID by removing leading zeros
// "001" -> "1", "01" -> "1", "1" -> "1"
const normalizePatientId = (id: string): string => {
  const trimmed = id.trim();
  if (!trimmed) return '';
  // Handle non-numeric IDs by just returning trimmed version
  const parsed = parseInt(trimmed, 10);
  return isNaN(parsed) ? trimmed : String(parsed);
};
interface QuickConsultDialogProps {
  trigger?: React.ReactNode;
  prefilledPatientId?: string;
  prefilledPatientData?: any;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function QuickConsultDialog({ trigger, prefilledPatientId, prefilledPatientData, open: externalOpen, onOpenChange: externalOnOpenChange }: QuickConsultDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  
  // Use external state if provided, otherwise use internal state
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = externalOnOpenChange || setInternalOpen;
  const [patientId, setPatientId] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [existingPatient, setExistingPatient] = useState<any>(null);
  const [lastConsult, setLastConsult] = useState<any>(null);
  const [existingDraftConsult, setExistingDraftConsult] = useState<any>(null);
  const [vetTechDuplicatePatient, setVetTechDuplicatePatient] = useState<any>(null);
  const [vetTechLastConsult, setVetTechLastConsult] = useState<any>(null);
  const [visitType, setVisitType] = useState('');
  const [showModeDialog, setShowModeDialog] = useState(false);
  const [modeDialogPatientInfo, setModeDialogPatientInfo] = useState<any>(null);
  const [modeDialogPatientId, setModeDialogPatientId] = useState('');
  const [modeDialogPatientUUID, setModeDialogPatientUUID] = useState<string | null>(null);
  const patientIdInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { canCreateConsult, isVetTech, isDVM } = usePermissions();
  const { clinicId } = useAuth();
  
  // Hard enforcement: Check consult limits
  const { canCreateConsult: hasConsultAvailable, showUpgradeModal, setShowUpgradeModal, consultsUsed, consultsCap, currentTier } = useConsultCreationGuard();

  // Full patient form state (for vet techs)
  const [patientName, setPatientName] = useState('');
  const [species, setSpecies] = useState('');
  const [breed, setBreed] = useState('');
  const [sex, setSex] = useState('');
  const [ageYears, setAgeYears] = useState('');
  const [ageMonths, setAgeMonths] = useState('');
  const [weight, setWeight] = useState('');
  const [weightUnit, setWeightUnit] = useState('kg');
  const [presentingComplaint, setPresentingComplaint] = useState('');

  // Pre-fill data when provided
  useEffect(() => {
    if (prefilledPatientId) {
      setPatientId(prefilledPatientId);
    }
    if (prefilledPatientData && !isVetTech) {
      setExistingPatient(prefilledPatientData);
    }
  }, [prefilledPatientId, prefilledPatientData, isVetTech]);

  // Don't render for users who can't create consults
  if (!canCreateConsult) {
    return null;
  }

  const handleStartConsult = async () => {
    if (!patientId.trim()) {
      toast({
        title: "Patient ID Required",
        description: "Please enter a patient ID",
        variant: "destructive",
      });
      return;
    }

    // Store info for mode selection dialog
    const trimmedPatientId = patientId.trim();
    
    // Build patient info for mode dialog
    let patientUUID: string | null = null;
    let patientInfoForDialog: any = null;

    if (prefilledPatientData) {
      patientUUID = prefilledPatientData.id;
      patientInfoForDialog = prefilledPatientData;
    } else if (existingPatient) {
      patientUUID = existingPatient.id;
      patientInfoForDialog = existingPatient;
    }

    // Store info and open mode selection dialog
    setModeDialogPatientId(normalizePatientId(patientId));
    setModeDialogPatientUUID(patientUUID);
    setModeDialogPatientInfo(patientInfoForDialog);
    
    // Close this dialog and open mode selection dialog
    setOpen(false);
    setPatientId('');
    setExistingPatient(null);
    setLastConsult(null);
    setExistingDraftConsult(null);
    
    // Small delay to allow first dialog to close before opening second
    setTimeout(() => {
      setShowModeDialog(true);
    }, 150);
  };

  const handleVetTechStartConsult = async () => {
    // Validate required fields
    if (!patientId.trim() || !patientName.trim() || !species.trim()) {
      toast({
        title: "Required Fields Missing",
        description: "Please fill in Patient ID, Name, and Species",
        variant: "destructive",
      });
      return;
    }

    // Prevent submission if duplicate exists
    if (vetTechDuplicatePatient) {
      toast({
        title: "Duplicate Patient ID",
        description: "This Patient ID already exists. Please use the existing patient or enter a different ID.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      if (!clinicId) throw new Error('No clinic found');

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

      // Calculate date of birth from age
      let dateOfBirth = null;
      if (ageYears || ageMonths) {
        const today = new Date();
        const years = parseInt(ageYears) || 0;
        const months = parseInt(ageMonths) || 0;
        const totalMonths = (years * 12) + months;
        const birthDate = new Date(today.getFullYear(), today.getMonth() - totalMonths, today.getDate());
        dateOfBirth = birthDate.toISOString().split('T')[0];
      }

      // Convert weight
      const weightKg = weight ? (weightUnit === 'kg' 
        ? parseFloat(weight) 
        : parseFloat(weight) / 2.20462) : null;
      const weightLb = weight ? (weightUnit === 'lb' 
        ? parseFloat(weight) 
        : parseFloat(weight) * 2.20462) : null;

      // Create new patient
      const { data: patient, error: patientError } = await supabase
        .from('patients')
        .insert({
          clinic_id: clinicId,
          owner_id: owner.id,
          name: patientName.trim(),
          species: species.trim(),
          breed: breed.trim() || null,
          sex: sex || null,
          date_of_birth: dateOfBirth,
          weight_kg: weightKg,
          weight_lb: weightLb,
          identifiers: { patient_id: normalizePatientId(patientId) },
        })
        .select()
        .single();

      if (patientError) throw patientError;

      // Create new consult with presenting complaint and visit type
      const { data: consult, error: consultError } = await supabase
        .from('consults')
        .insert({
          clinic_id: clinicId,
          patient_id: patient.id,
          owner_id: owner.id,
          status: 'draft',
          visit_type: visitType || null,
          reason_for_visit: presentingComplaint.trim() || null,
        })
        .select()
        .single();

      if (consultError) throw consultError;

      toast({
        title: "Success",
        description: "Patient and consultation created",
      });

      // Reset form
      setOpen(false);
      setPatientId('');
      setPatientName('');
      setSpecies('');
      setBreed('');
      setSex('');
      setAgeYears('');
      setAgeMonths('');
      setWeight('');
      setVisitType('');
      setPresentingComplaint('');
      setVetTechDuplicatePatient(null);
      setVetTechLastConsult(null);
      
      navigate(`/consults/${consult.id}`);
    } catch (error: any) {
      console.error('Error starting consult:', error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Debounced lookup for existing patient by patient_id (only for vet/DVM)
  useEffect(() => {
    if (isVetTech) return; // Skip lookup for vet techs
    if (prefilledPatientData) return; // Skip if patient data already provided

    const timer = setTimeout(async () => {
      if (!patientId.trim() || !clinicId) {
        setExistingPatient(null);
        setLastConsult(null);
        setExistingDraftConsult(null);
        return;
      }
      setChecking(true);
      try {
        const { data: patient } = await supabase
          .from('patients')
          .select('id, name, species, breed, date_of_birth')
          .eq('clinic_id', clinicId)
          .eq('identifiers->>patient_id', normalizePatientId(patientId))
          .maybeSingle();

        if (patient) {
          setExistingPatient(patient);
          
          // Check for last consult
          const { data: consult } = await supabase
            .from('consults')
            .select('id, started_at, status, reason_for_visit')
            .eq('patient_id', patient.id)
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          setLastConsult(consult || null);

          // Check for existing draft from today
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          const { data: draft } = await supabase
            .from('consults')
            .select('id, visit_type, reason_for_visit, weight_kg, weight_lb')
            .eq('patient_id', patient.id)
            .eq('status', 'draft')
            .gte('started_at', today.toISOString())
            .maybeSingle();
          
          setExistingDraftConsult(draft || null);
        } else {
          setExistingPatient(null);
          setLastConsult(null);
          setExistingDraftConsult(null);
        }
      } finally {
        setChecking(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [patientId, clinicId, isVetTech, prefilledPatientData]);

  // Debounced duplicate check for vet techs
  useEffect(() => {
    if (!isVetTech) return; // Only for vet techs

    const timer = setTimeout(async () => {
      if (!patientId.trim() || !clinicId) {
        setVetTechDuplicatePatient(null);
        setVetTechLastConsult(null);
        return;
      }
      setChecking(true);
      try {
        const { data: patient } = await supabase
          .from('patients')
          .select('id, name, species, breed, date_of_birth')
          .eq('clinic_id', clinicId)
          .eq('identifiers->>patient_id', normalizePatientId(patientId))
          .maybeSingle();

        if (patient) {
          setVetTechDuplicatePatient(patient);
          const { data: consult } = await supabase
            .from('consults')
            .select('id, started_at, status, reason_for_visit')
            .eq('patient_id', patient.id)
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          setVetTechLastConsult(consult || null);
        } else {
          setVetTechDuplicatePatient(null);
          setVetTechLastConsult(null);
        }
      } finally {
        setChecking(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [patientId, clinicId, isVetTech]);

  const calculateAge = (dob?: string | null) => {
    if (!dob) return 'Unknown';
    const birth = new Date(dob);
    const today = new Date();
    let years = today.getFullYear() - birth.getFullYear();
    const hasHadBirthday =
      today.getMonth() > birth.getMonth() ||
      (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
    if (!hasHadBirthday) years -= 1;
    return `${years} year${years !== 1 ? 's' : ''}`;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        {trigger && (
          <DialogTrigger asChild>
            <div className="flex flex-col h-full" onClick={(e) => {
              if (!hasConsultAvailable) {
                e.preventDefault();
                setShowUpgradeModal(true);
              }
            }}>
              {trigger || (
                <Button className="gap-2" disabled={!hasConsultAvailable}>
                  <Plus className="h-4 w-4" />
                  Start New Consult
                </Button>
              )}
            </div>
          </DialogTrigger>
        )}
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isVetTech ? 'Create New Patient & Start Consult' : 'Start New Consultation'}
          </DialogTitle>
        </DialogHeader>

        {isVetTech ? (
          // Full patient form for vet techs
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="patientId">Patient ID *</Label>
                <Input
                  ref={patientIdInputRef}
                  id="patientId"
                  placeholder="e.g., 12345"
                  value={patientId}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, '');
                    setPatientId(value);
                  }}
                  disabled={loading}
                  className={vetTechDuplicatePatient ? 'border-destructive' : ''}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Numbers only - no letters or special characters
                </p>
                {checking && (
                  <p className="text-xs text-muted-foreground">Checking...</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="patientName">Patient Name *</Label>
                <Input
                  id="patientName"
                  placeholder="e.g., Max"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="species">Species *</Label>
                <Select value={species} onValueChange={setSpecies} disabled={loading}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select species" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Canine">Canine</SelectItem>
                    <SelectItem value="Feline">Feline</SelectItem>
                    <SelectItem value="Avian">Avian</SelectItem>
                    <SelectItem value="Exotic">Exotic</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="breed">Breed</Label>
                <Input
                  id="breed"
                  placeholder="e.g., Golden Retriever"
                  value={breed}
                  onChange={(e) => setBreed(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sex">Sex</Label>
                <Select value={sex} onValueChange={setSex} disabled={loading}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select sex" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Male Neutered">Male Neutered</SelectItem>
                    <SelectItem value="Female Spayed">Female Spayed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Age</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Years"
                    type="number"
                    min="0"
                    value={ageYears}
                    onChange={(e) => setAgeYears(e.target.value)}
                    disabled={loading}
                  />
                  <Input
                    placeholder="Months"
                    type="number"
                    min="0"
                    max="11"
                    value={ageMonths}
                    onChange={(e) => setAgeMonths(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Weight</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="0.0"
                  type="number"
                  step="0.1"
                  min="0"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  disabled={loading}
                  className="flex-1"
                />
                <Select value={weightUnit} onValueChange={setWeightUnit} disabled={loading}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="lb">lb</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {vetTechDuplicatePatient && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-3">
                    <p className="font-semibold">This Patient ID already exists in your clinic.</p>
                    <Card className="border-border bg-card">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <User className="h-4 w-4" />
                          {vetTechDuplicatePatient.name}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm space-y-1 text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Species:</span>
                          <span>{vetTechDuplicatePatient.species}</span>
                        </div>
                        {vetTechDuplicatePatient.breed && (
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Breed:</span>
                            <span>{vetTechDuplicatePatient.breed}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3" />
                          <span className="font-medium">Age:</span>
                          <span>{calculateAge(vetTechDuplicatePatient.date_of_birth)}</span>
                        </div>
                        {vetTechLastConsult && (
                          <div className="flex items-center gap-2 pt-2 border-t">
                            <Stethoscope className="h-3 w-3" />
                            <span className="font-medium">Last Consult:</span>
                            <span>{format(new Date(vetTechLastConsult.started_at), 'MMM dd, yyyy')}</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          navigate(`/patients/${vetTechDuplicatePatient.id}`);
                        }}
                      >
                        View Patient
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setPatientId('');
                          setVetTechDuplicatePatient(null);
                          setVetTechLastConsult(null);
                        }}
                      >
                        Re-enter Patient ID
                      </Button>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="vetTechVisitType">Type of Visit *</Label>
              <Select
                value={visitType}
                onValueChange={setVisitType}
                disabled={loading}
              >
                <SelectTrigger id="vetTechVisitType">
                  <SelectValue placeholder="Select visit type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sickness">Sickness / Emergency</SelectItem>
                  <SelectItem value="chronic">Chronic Illness</SelectItem>
                  <SelectItem value="wellness">Wellness / Vaccine</SelectItem>
                  <SelectItem value="procedure">Procedure</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="presentingComplaint">Presenting Complaint</Label>
              <Textarea
                id="presentingComplaint"
                placeholder="Brief description of why the patient is here today..."
                value={presentingComplaint}
                onChange={(e) => setPresentingComplaint(e.target.value)}
                disabled={loading}
                rows={3}
              />
            </div>

            <Button
              onClick={handleVetTechStartConsult}
              disabled={!patientId.trim() || !patientName.trim() || !species.trim() || !visitType || loading || !!vetTechDuplicatePatient}
              className="w-full"
            >
              {loading ? 'Creating...' : 'Create Patient & Start Consult'}
            </Button>
          </div>
        ) : (
          // Simple patient ID dialog for vets/DVMs
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="patientId">Patient ID</Label>
              <Input
                ref={patientIdInputRef}
                id="patientId"
                type="text"
                inputMode="numeric"
                placeholder="e.g., 12345"
                value={patientId}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9]/g, '');
                  setPatientId(value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && patientId.trim() && !loading) {
                    handleStartConsult();
                  }
                }}
                disabled={loading}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Numbers only - no letters or special characters
              </p>
            </div>

            {checking && (
              <div className="text-sm text-muted-foreground">
                Checking for existing patient...
              </div>
            )}

            {existingPatient && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-3">
                    <p className="font-semibold">Patient found:</p>
                    <Card className="border-border bg-card">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <User className="h-4 w-4" />
                          {existingPatient.name}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm space-y-1 text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Species:</span>
                          <span>{existingPatient.species}</span>
                        </div>
                        {existingPatient.breed && (
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Breed:</span>
                            <span>{existingPatient.breed}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3" />
                          <span className="font-medium">Age:</span>
                          <span>{calculateAge(existingPatient.date_of_birth)}</span>
                        </div>
                        {lastConsult && (
                          <div className="flex items-center gap-2 pt-2 border-t">
                            <Stethoscope className="h-3 w-3" />
                            <span className="font-medium">Last Visit:</span>
                            <span>{format(new Date(lastConsult.started_at), 'MMM dd, yyyy')}</span>
                          </div>
                        )}
                        {lastConsult?.reason_for_visit && (
                          <div className="text-xs text-muted-foreground pt-1">
                            {lastConsult.reason_for_visit}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2 pt-4">
              {existingPatient ? (
                <>
                  <Button
                    onClick={handleStartConsult}
                    disabled={loading}
                    className="flex-1"
                  >
                    {loading ? 'Continuing...' : 'CONTINUE'}
                  </Button>
                  <Button
                    onClick={() => {
                      setExistingPatient(null);
                      setLastConsult(null);
                      setPatientId('');
                    }}
                    variant="outline"
                    className="flex-1"
                  >
                    Re-enter Patient ID
                  </Button>
                </>
              ) : (
                <Button
                  onClick={handleStartConsult}
                  disabled={!patientId.trim() || loading}
                  className="w-full"
                >
                  {loading ? 'Continuing...' : 'CONTINUE'}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
    
    <UpgradePlanModal 
      open={showUpgradeModal} 
      onOpenChange={setShowUpgradeModal}
      reason="consult_limit"
      consultInfo={{ used: consultsUsed || 0, cap: consultsCap || 0 }}
      currentTier={currentTier}
    />
    
    <ConsultModeSelectionDialog
      open={showModeDialog}
      onOpenChange={setShowModeDialog}
      patientId={modeDialogPatientId}
      patientUUID={modeDialogPatientUUID}
      patientInfo={modeDialogPatientInfo}
    />
    </>
  );
}
