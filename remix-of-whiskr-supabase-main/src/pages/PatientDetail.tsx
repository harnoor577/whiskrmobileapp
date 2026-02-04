import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/hooks/use-permissions";
import { useConsultCreationGuard } from "@/hooks/use-consult-creation-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowLeft, Stethoscope, Edit, AlertCircle, Trash2, Activity, User, Building2, Calendar, Pencil, Heart, Home } from "lucide-react";
import { PatientDetailSkeleton } from "@/components/patient/PatientDetailSkeleton";
import { hasEuthanasiaConsult } from "@/utils/euthanasiaDetection";
import { parseVitalsFromText } from "@/utils/vitalsParser";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DeleteConfirmationDialog } from "@/components/ui/delete-confirmation-dialog";
import { useToast } from "@/hooks/use-toast";
import { EditVitalsDialog } from "@/components/consult/EditVitalsDialog";
import { QuickConsultDialog } from "@/components/consult/QuickConsultDialog";
import { RecordVisitDialog } from "@/components/consult/RecordVisitDialog";
import { UpgradePlanModal } from "@/components/billing/UpgradePlanModal";
import { EditAssignmentDialog } from "@/components/patient/EditAssignmentDialog";
import { CaseActivityDialog } from "@/components/patient/CaseActivityDialog";
import { EditPatientBasicDialog } from "@/components/consult/EditPatientBasicDialog";
import { VisitTimeline } from "@/components/patient/VisitTimeline";
import { DiagnosticsSection } from "@/components/patient/DiagnosticsSection";
import { PatientCaseSummary } from "@/components/patient/PatientCaseSummary";
import { format } from "date-fns";
import { formatDisplayName } from "@/lib/formatDisplayName";
import { getCachedData, setCacheData } from "@/hooks/use-prefetch";

export default function PatientDetail() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { clinicId, user } = useAuth();
  const currentUserName = user?.user_metadata?.name || null;
  const { canEditPatient, canDeletePatient, canDeleteConsult, isDVM, isVetTech } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<any>(null);
  const [consults, setConsults] = useState<any[]>([]);
  const [diagnostics, setDiagnostics] = useState<any[]>([]);
  const [clinicName, setClinicName] = useState<string>("");
  const [assignedVetName, setAssignedVetName] = useState<string | null>(null);
  const [assignedVetPrefix, setAssignedVetPrefix] = useState<string>('Dr.');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [consultToDelete, setConsultToDelete] = useState<string | null>(null);
  const [deletePatientDialogOpen, setDeletePatientDialogOpen] = useState(false);
  const [recordVisitOpen, setRecordVisitOpen] = useState(false);
  const [editVitalsDialogOpen, setEditVitalsDialogOpen] = useState(false);
  const [consultToEditVitals, setConsultToEditVitals] = useState<string | null>(null);
  const [editAssignmentOpen, setEditAssignmentOpen] = useState(false);
  const [showQuickConsultDialog, setShowQuickConsultDialog] = useState(false);
  const [showActivityDialog, setShowActivityDialog] = useState(false);
  const [showEditPatientDialog, setShowEditPatientDialog] = useState(false);
  const { toast } = useToast();
  
  
  const { canCreateConsult: hasConsultAvailable, showUpgradeModal, setShowUpgradeModal, consultsUsed, consultsCap, currentTier } = useConsultCreationGuard();


  useEffect(() => {
    if (clinicId && patientId) {
      fetchPatientData();

      const channel = supabase
        .channel(`patient-${patientId}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'patients',
          filter: `id=eq.${patientId}`
        }, (payload) => {
          setPatient(payload.new);
        })
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'consults',
          filter: `patient_id=eq.${patientId}`
        }, () => {
          // Refetch all consults to get enriched data
          fetchPatientData();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [clinicId, patientId, location.search]);


  const fetchPatientData = async () => {
    try {
      // Check cache first for instant display
      const cacheKey = `patient-detail-${patientId}`;
      const cachedData = getCachedData<{ patient: any; clinic: any; consults: any[] }>(cacheKey);
      
      if (cachedData) {
        setPatient(cachedData.patient);
        if (cachedData.clinic) setClinicName(cachedData.clinic.name);
        // Process cached consults
        if (cachedData.consults) {
          const enrichedFromCache = enrichConsultsFromMessages(cachedData.consults);
          setConsults(enrichedFromCache);
        }
        setLoading(false);
      } else {
        setLoading(true);
      }

      // Fetch patient, clinic, and consults with chat_messages in parallel
      const [patientResult, clinicResult, consultsResult] = await Promise.all([
        supabase
          .from("patients")
          .select("*")
          .eq("id", patientId)
          .eq("clinic_id", clinicId)
          .maybeSingle(),
        supabase
          .from("clinics")
          .select("name")
          .eq("id", clinicId)
          .maybeSingle(),
        supabase
          .from("consults")
          .select(`
            *, 
            chat_messages (content, role, created_at)
          `)
          .eq("patient_id", patientId)
          .eq("clinic_id", clinicId)
          .order("created_at", { ascending: false })
      ]);

      if (patientResult.error) throw patientResult.error;
      const patientData = patientResult.data;
      
      if (!patientData) {
        setLoading(false);
        return;
      }
      
      setPatient(patientData);
      
      if (clinicResult.data) {
        setClinicName(clinicResult.data.name);
      }
      
      // Cache the fetched data
      setCacheData(cacheKey, {
        patient: patientData,
        clinic: clinicResult.data,
        consults: consultsResult.data || []
      });
      
      // Fallback enrichment for incomplete patients
      const isIncomplete = !patientData?.name || 
        patientData.name === 'New Patient' || 
        !patientData?.species || 
        patientData.species === 'Unknown';
      
      if (isIncomplete && patientData?.id) {
        console.log('Triggering fallback enrichment for incomplete patient:', patientData.id);
        supabase.functions.invoke('enrich-patient-details', {
          body: { patientId: patientData.id }
        }).then(async () => {
          const { data: refreshedPatient } = await supabase
            .from('patients')
            .select('*')
            .eq('id', patientData.id)
            .maybeSingle();
          if (refreshedPatient) {
            setPatient(refreshedPatient);
          }
        }).catch(err => console.log('Fallback enrichment error:', err));
      }

      const consultsData = consultsResult.data || [];
      
      // Fetch profile names for vet_user_id and finalized_by
      const userIds = new Set<string>();
      consultsData.forEach((c: any) => {
        if (c.vet_user_id) userIds.add(c.vet_user_id);
        if (c.finalized_by) userIds.add(c.finalized_by);
      });
      
      const profileMap: Record<string, string> = {};
      if (userIds.size > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, name")
          .in("user_id", Array.from(userIds));
        
        profiles?.forEach((p) => {
          profileMap[p.user_id] = p.name;
        });
      }
      
      // Enrich consults with profile names
      const consultsWithProfiles = consultsData.map((c: any) => ({
        ...c,
        vet_profile: c.vet_user_id ? { name: profileMap[c.vet_user_id] } : null,
        finalized_by_profile: c.finalized_by ? { name: profileMap[c.finalized_by] } : null,
      }));
      
      // Get the assigned vet name - prioritize patient's assigned_vet_id, fallback to first clinic vet
      let vetUserId = patientData.assigned_vet_id;
      
      if (!vetUserId) {
        const { data: vetRole } = await supabase
          .from("clinic_roles")
          .select("user_id")
          .eq("clinic_id", clinicId)
          .eq("role", "vet")
          .limit(1)
          .maybeSingle();
        
        vetUserId = vetRole?.user_id;
      }

      if (vetUserId) {
        const { data: vetProfile } = await supabase
          .from("profiles")
          .select("name, name_prefix")
          .eq("user_id", vetUserId)
          .maybeSingle();
        
        if (vetProfile) {
          setAssignedVetName(vetProfile.name);
          setAssignedVetPrefix((vetProfile as any).name_prefix || 'Dr.');
        } else {
          setAssignedVetName(null);
        }
      } else {
        setAssignedVetName(null);
      }

      // Enrich consults from chat_messages already included in query (no additional queries!)
      const enrichedConsults = enrichConsultsFromMessages(consultsWithProfiles);
      setConsults(enrichedConsults);

      // Fetch diagnostics for this patient's consults
      const consultIds = consultsData.map((c: any) => c.id);
      if (consultIds.length > 0) {
        const { data: diagnosticsData } = await supabase
          .from('file_assets')
          .select('*')
          .in('consult_id', consultIds)
          .neq('document_type', 'medical_history')
          .order('created_at', { ascending: false });
        
        if (diagnosticsData) {
          setDiagnostics(diagnosticsData);
        }
      } else {
        setDiagnostics([]);
      }
    } catch (error) {
      console.error("Error fetching patient:", error);
    } finally {
      setLoading(false);
    }
  };
  
  // Helper function to enrich consults from their embedded chat_messages
  const enrichConsultsFromMessages = (consultsWithMessages: any[]) => {
    return consultsWithMessages.map((consult) => {
      let enrichedConsult = { ...consult };
      
      // Get assistant messages from the embedded chat_messages
      const messages = (consult.chat_messages || [])
        .filter((m: any) => m.role === 'assistant')
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5);
      
      if (consult.status === 'finalized' && !consult.soap_a && messages.length > 0) {
        for (const msg of messages) {
          const diagnosisMatch = msg.content.match(/\*\*Working Diagnosis:\*\*\s*([^\n]+)/i);
          if (diagnosisMatch) {
            enrichedConsult.soap_a = diagnosisMatch[1].trim();
            break;
          }
        }
      }
      
      if (!enrichedConsult.vitals_last_updated_at && messages.length > 0) {
        for (const msg of messages) {
          const vitalsSection = msg.content.match(/## Vitals\s*\n([\s\S]*?)(?=\n##|$)/i);
          if (vitalsSection) {
            const vitalsText = vitalsSection[1];
            
            const weightMatch = vitalsText.match(/Weight:\*\*\s*([\d.]+)\s*(lb|kg)/i);
            if (weightMatch) {
              const value = parseFloat(weightMatch[1]);
              const unit = weightMatch[2].toLowerCase();
              if (unit === 'lb') {
                enrichedConsult.weight_lb = value;
                enrichedConsult.weight_kg = parseFloat((value / 2.20462).toFixed(2));
              } else {
                enrichedConsult.weight_kg = value;
                enrichedConsult.weight_lb = parseFloat((value * 2.20462).toFixed(2));
              }
            }
            
            const tempMatch = vitalsText.match(/Temperature:\*\*\s*([\d.]+)\s*°?(F|C)/i);
            if (tempMatch) {
              const value = parseFloat(tempMatch[1]);
              const unit = tempMatch[2].toUpperCase();
              if (unit === 'F') {
                enrichedConsult.vitals_temperature_f = value;
                enrichedConsult.vitals_temperature_c = parseFloat(((value - 32) * 5/9).toFixed(1));
              } else {
                enrichedConsult.vitals_temperature_c = value;
                enrichedConsult.vitals_temperature_f = parseFloat((value * 9/5 + 32).toFixed(1));
              }
            }
            
            const hrMatch = vitalsText.match(/Heart Rate:\*\*\s*([\d.]+)\s*bpm/i);
            if (hrMatch) {
              enrichedConsult.vitals_heart_rate = parseInt(hrMatch[1]);
            }
            
            const rrMatch = vitalsText.match(/Respiratory Rate:\*\*\s*([\d.]+)\s*bpm/i);
            if (rrMatch) {
              enrichedConsult.vitals_respiratory_rate = parseInt(rrMatch[1]);
            }
            
            const bcsMatch = vitalsText.match(/Body Condition Score:\*\*\s*([^\n]+)/i);
            if (bcsMatch) {
              enrichedConsult.vitals_body_condition_score = bcsMatch[1].trim();
            }
            
            const dehydMatch = vitalsText.match(/Dehydration %:\*\*\s*([^\n]+)/i);
            if (dehydMatch) {
              enrichedConsult.vitals_dehydration_percent = dehydMatch[1].trim();
            }
            
            const painMatch = vitalsText.match(/Pain Score:\*\*\s*(\d+)/i);
            if (painMatch) {
              enrichedConsult.vitals_pain_score = parseInt(painMatch[1]);
            }
            
            const crtMatch = vitalsText.match(/Capillary Refill Time \(CRT\):\*\*\s*([^\n]+)/i);
            if (crtMatch) {
              enrichedConsult.vitals_crt = crtMatch[1].trim();
            }
            
            const mmMatch = vitalsText.match(/Mucous Membranes:\*\*\s*([^\n]+)/i);
            if (mmMatch) {
              enrichedConsult.vitals_mucous_membranes = mmMatch[1].trim();
            }
            
            const attMatch = vitalsText.match(/Attitude:\*\*\s*([^\n]+)/i);
            if (attMatch) {
              enrichedConsult.vitals_attitude = attMatch[1].trim();
            }
            
            break;
          }
        }
      }
      
      // Parse vitals from original_input if database vitals are empty
      if (!enrichedConsult.vitals_temperature_f && consult.original_input) {
        const parsedVitals = parseVitalsFromText(consult.original_input);
        
        if (parsedVitals.temperature_f) {
          enrichedConsult.vitals_temperature_f = parsedVitals.temperature_f;
          enrichedConsult.vitals_temperature_c = parsedVitals.temperature_c;
        }
        if (parsedVitals.heart_rate) {
          enrichedConsult.vitals_heart_rate = parsedVitals.heart_rate;
        }
        if (parsedVitals.respiratory_rate) {
          enrichedConsult.vitals_respiratory_rate = parsedVitals.respiratory_rate;
        }
        if (parsedVitals.weight_kg && !enrichedConsult.weight_kg) {
          enrichedConsult.weight_kg = parsedVitals.weight_kg;
          enrichedConsult.weight_lb = parsedVitals.weight_lb;
        }
        if (parsedVitals.crt) {
          enrichedConsult.vitals_crt = parsedVitals.crt;
        }
        if (parsedVitals.mucous_membranes) {
          enrichedConsult.vitals_mucous_membranes = parsedVitals.mucous_membranes;
        }
        if (parsedVitals.attitude) {
          enrichedConsult.vitals_attitude = parsedVitals.attitude;
        }
        if (parsedVitals.body_condition_score) {
          enrichedConsult.vitals_body_condition_score = parsedVitals.body_condition_score;
        }
        if (parsedVitals.dehydration_percent) {
          enrichedConsult.vitals_dehydration_percent = parsedVitals.dehydration_percent;
        }
        if (parsedVitals.pain_score) {
          enrichedConsult.vitals_pain_score = parsedVitals.pain_score;
        }
      }
      
      return enrichedConsult;
    });
  };

  const toMedicalSpecies = (species: string) => {
    const lowerSpecies = species.toLowerCase();
    if (lowerSpecies === 'dog') return 'Canine';
    if (lowerSpecies === 'cat') return 'Feline';
    if (lowerSpecies === 'bird') return 'Avian';
    if (lowerSpecies === 'rabbit') return 'Lagomorph';
    if (lowerSpecies === 'horse') return 'Equine';
    if (lowerSpecies === 'cow' || lowerSpecies === 'cattle') return 'Bovine';
    if (lowerSpecies === 'pig') return 'Porcine';
    if (lowerSpecies === 'sheep') return 'Ovine';
    if (lowerSpecies === 'goat') return 'Caprine';
    return species.charAt(0).toUpperCase() + species.slice(1);
  };

  const calculateAge = (dateOfBirth: string) => {
    const birth = new Date(dateOfBirth);
    const today = new Date();
    const years = today.getFullYear() - birth.getFullYear();
    const months = today.getMonth() - birth.getMonth();
    
    if (years === 0) {
      return `${months} month${months !== 1 ? 's' : ''}`;
    }
    return `${years} year${years !== 1 ? 's' : ''}`;
  };

  const handleDeleteConsult = async () => {
    if (!consultToDelete || !clinicId) return;

    try {
      const { error } = await supabase.rpc('delete_consult_cascade', {
        _consult_id: consultToDelete,
        _clinic_id: clinicId,
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Consultation deleted successfully',
      });

      fetchPatientData();
    } catch (error: any) {
      console.error('Error deleting consultation:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to delete consultation',
      });
    } finally {
      setConsultToDelete(null);
    }
  };

  const handleDeletePatient = async () => {
    if (!patient || !patientId || !clinicId) return;

    try {
      const { error } = await supabase.rpc('delete_patient_cascade', {
        _patient_id: patientId,
        _clinic_id: clinicId,
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Patient deleted successfully',
      });

      navigate('/patients');
    } catch (error: any) {
      console.error('Error deleting patient:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to delete patient',
      });
    }
  };


  if (loading) {
    return <PatientDetailSkeleton />;
  }

  if (!patient) {
    return (
      <div className="container mx-auto py-8">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Patient not found</AlertDescription>
        </Alert>
        <Button onClick={() => navigate("/patients")} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Patients
        </Button>
      </div>
    );
  }

  return (
    <>
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConsult}
        title="Delete Consultation"
        description="This will permanently delete the consultation and all associated chat messages. This action cannot be undone."
      />

      <DeleteConfirmationDialog
        open={deletePatientDialogOpen}
        onOpenChange={setDeletePatientDialogOpen}
        onConfirm={handleDeletePatient}
        title="Delete Patient"
        description="This will permanently delete the patient and all associated consultations and data. This action cannot be undone."
        itemName={patient?.name}
      />

      <RecordVisitDialog
        open={recordVisitOpen}
        onOpenChange={setRecordVisitOpen}
        patientId={patientId!}
        onVisitRecorded={fetchPatientData}
      />

      {editVitalsDialogOpen && consultToEditVitals && (
        <EditVitalsDialog
          open={editVitalsDialogOpen}
          onOpenChange={setEditVitalsDialogOpen}
          consultId={consultToEditVitals}
          clinicId={clinicId!}
          currentVitals={consults.find(c => c.id === consultToEditVitals)}
          onVitalsUpdated={fetchPatientData}
        />
      )}

      <UpgradePlanModal 
        open={showUpgradeModal} 
        onOpenChange={setShowUpgradeModal}
        reason="consult_limit"
        consultInfo={{ used: consultsUsed || 0, cap: consultsCap || 0 }}
        currentTier={currentTier}
      />

      {/* Edit Patient Dialog */}
      <EditPatientBasicDialog
        open={showEditPatientDialog}
        onOpenChange={setShowEditPatientDialog}
        patient={patient ? {
          id: patient.id,
          name: patient.name || '',
          species: patient.species || '',
          breed: patient.breed,
          sex: patient.sex,
          age: patient.age,
          identifiers: patient.identifiers,
        } : null}
        onPatientUpdated={fetchPatientData}
      />

      <div className="px-0 sm:px-4 md:px-6 lg:px-8 py-2 md:py-4 pb-24 md:pb-4 space-y-3 md:space-y-6">
        {/* Back Button */}
        <div className="flex items-center">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate("/patients")}
            className="text-muted-foreground hover:text-foreground -ml-2"
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" /> 
            <span className="uppercase text-xs font-semibold tracking-wider">Back</span>
          </Button>
        </div>

        {/* Action Buttons Grid - Hidden on mobile, shown on md+ */}
        <div className="hidden md:grid md:grid-cols-4 gap-3">
          {isDVM ? (
            <QuickConsultDialog
              prefilledPatientId={patient?.identifiers?.patient_id}
              prefilledPatientData={patient}
              trigger={
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        size="sm" 
                        className="w-full h-11"
                        disabled={!hasConsultAvailable}
                        onClick={(e) => {
                          if (!hasConsultAvailable) {
                            e.preventDefault();
                            setShowUpgradeModal(true);
                          }
                        }}
                      >
                        <Stethoscope className="mr-2 h-4 w-4" /> 
                        <span className="hidden xs:inline">New Consult</span>
                        <span className="xs:hidden">Consult</span>
                      </Button>
                    </TooltipTrigger>
                    {!hasConsultAvailable && (
                      <TooltipContent>
                        <p>Consult limit reached. Upgrade to continue.</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              }
            />
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    size="sm"
                    onClick={() => setRecordVisitOpen(true)}
                    className="w-full h-11"
                  >
                    <Stethoscope className="mr-2 h-4 w-4" /> 
                    <span className="hidden xs:inline">New Visit</span>
                    <span className="xs:hidden">Visit</span>
                  </Button>
                </TooltipTrigger>
              </Tooltip>
            </TooltipProvider>
          )}
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => canEditPatient && setShowEditPatientDialog(true)} 
                  className="w-full h-11"
                  disabled={!canEditPatient}
                >
                  <Edit className="mr-2 h-4 w-4" /> Edit
                </Button>
              </TooltipTrigger>
              {!canEditPatient && (
                <TooltipContent>
                  <p>You do not have permission to edit patients</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          
          <CaseActivityDialog
            consults={consults}
            currentUserName={currentUserName}
            trigger={
              <Button 
                variant="outline" 
                size="sm"
                className="w-full h-11"
              >
                <Activity className="mr-2 h-4 w-4" /> 
                <span className="hidden xs:inline">Case Activity</span>
                <span className="xs:hidden">Activity</span>
              </Button>
            }
          />
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => canDeletePatient && setDeletePatientDialogOpen(true)}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 w-full h-11"
                  disabled={!canDeletePatient}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </Button>
              </TooltipTrigger>
              {!canDeletePatient && (
                <TooltipContent>
                  <p>Only vets or techs are allowed to delete patients</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Unified Patient Card */}
        <Card className="border-border/50 shadow-sm">
          <CardContent className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6">
            {/* Header: Patient Name + Species + Badge */}
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                  {patient.name}
                </h2>
                {hasEuthanasiaConsult(consults) && (
                  <Badge 
                    variant="outline" 
                    className="bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-200 dark:border-purple-800 flex items-center gap-1.5"
                  >
                    <Heart className="h-4 w-4" />
                    Passed Away
                  </Badge>
                )}
              </div>
              <p className="text-sm md:text-base text-muted-foreground">
                {toMedicalSpecies(patient.species)} • {patient.breed || "Mixed"}
              </p>
            </div>
            
            <Separator />
            
            {/* Two-column: Details + Assignment */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Details Column */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Details</h3>
                </div>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground">Sex:</span>
                    <span className="font-medium text-foreground">{patient.sex || "Unknown"}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground">Age:</span>
                    <span className="font-medium text-foreground">
                      {patient.age || (patient.date_of_birth ? calculateAge(patient.date_of_birth) : "Unknown")}
                    </span>
                  </li>
                  {(patient.weight_kg || patient.weight_lb) && (
                    <li className="flex items-center gap-2">
                      <span className="text-muted-foreground">•</span>
                      <span className="text-muted-foreground">Weight:</span>
                      <span className="font-medium text-foreground">{patient.weight_lb} lb</span>
                    </li>
                  )}
                  {patient.identifiers && Object.keys(patient.identifiers).length > 0 && 
                    Object.entries(patient.identifiers).map(([key, value]) => (
                      <li key={key} className="flex items-center gap-2">
                        <span className="text-muted-foreground">•</span>
                        <span className="text-muted-foreground">{key}:</span>
                        <span className="font-medium text-foreground">{value as string}</span>
                      </li>
                    ))
                  }
                </ul>
              </div>
              
              {/* Assignment Column */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Assignment</h3>
                  {canEditPatient && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setEditAssignmentOpen(true)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-muted-foreground">Doctor:</span>
                    <span className="font-medium text-foreground">
                      {assignedVetName ? formatDisplayName(assignedVetName, assignedVetPrefix) : "Unassigned"}
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-muted-foreground">Clinic:</span>
                    <span className="font-medium text-foreground">{clinicName}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-muted-foreground">Latest Visit:</span>
                    <span className="font-medium text-foreground">
                      {consults[0]?.created_at 
                        ? format(new Date(consults[0].created_at), "MMMM d, yyyy 'at' h:mm a")
                        : "No visits recorded"
                      }
                    </span>
                  </li>
                </ul>
              </div>
            </div>
            
            {/* Diagnostics Section (if any) */}
            {diagnostics.length > 0 && (
              <>
                <Separator />
                <DiagnosticsSection diagnostics={diagnostics} embedded />
              </>
            )}
            
            {/* Patient Summary */}
            <PatientCaseSummary consults={consults} />
            
            <Separator />
            
            {/* Visit Timeline */}
            <VisitTimeline
              consults={consults}
              weightUnit="lb"
              canDeleteConsult={canDeleteConsult}
              patientId={patient.id}
              clinicId={patient.clinic_id}
              onDeleteConsult={(id) => {
                setConsultToDelete(id);
                setDeleteDialogOpen(true);
              }}
              embedded
            />
          </CardContent>
        </Card>

        {/* Edit Assignment Dialog */}
        <EditAssignmentDialog
          open={editAssignmentOpen}
          onOpenChange={setEditAssignmentOpen}
          patientId={patientId!}
          currentAssignedVetId={patient?.assigned_vet_id}
          onSaved={fetchPatientData}
        />
      </div>

      {/* Quick Consult Dialog - for bottom nav */}
      <QuickConsultDialog
        open={showQuickConsultDialog}
        onOpenChange={setShowQuickConsultDialog}
        prefilledPatientId={patient?.identifiers?.patient_id}
        prefilledPatientData={patient}
      />

      {/* Activity Dialog - for bottom nav */}
      <CaseActivityDialog
        consults={consults}
        currentUserName={currentUserName}
        open={showActivityDialog}
        onOpenChange={setShowActivityDialog}
      />

      {/* Fixed Bottom Action Bar - Mobile Only */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border">
        <div className="flex items-center justify-around px-2 py-2">
          {/* Dashboard */}
          <button
            onClick={() => navigate('/dashboard')}
            className="flex flex-col items-center gap-0.5 py-2 px-3"
          >
            <Home className="h-5 w-5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Dashboard</span>
          </button>

          {/* Edit */}
          <button
            onClick={() => canEditPatient && setShowEditPatientDialog(true)}
            disabled={!canEditPatient}
            className="flex flex-col items-center gap-0.5 py-2 px-3 disabled:opacity-50"
          >
            <Edit className="h-5 w-5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Edit</span>
          </button>

          {/* Consult - Center, Larger (Green) */}
          <button
            onClick={() => {
              if (!hasConsultAvailable) {
                setShowUpgradeModal(true);
              } else {
                setShowQuickConsultDialog(true);
              }
            }}
            className="flex flex-col items-center gap-0.5"
          >
            <div className="h-14 w-14 rounded-full bg-[#0D9488] shadow-lg flex items-center justify-center -mt-4">
              <Stethoscope className="h-6 w-6 text-white" />
            </div>
            <span className="text-[10px] text-[#0D9488] font-semibold">Consult</span>
          </button>

          {/* Activity */}
          <button
            onClick={() => setShowActivityDialog(true)}
            className="flex flex-col items-center gap-0.5 py-2 px-3"
          >
            <Activity className="h-5 w-5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Activity</span>
          </button>

          {/* Delete */}
          <button
            onClick={() => canDeletePatient && setDeletePatientDialogOpen(true)}
            disabled={!canDeletePatient}
            className="flex flex-col items-center gap-0.5 py-2 px-3 disabled:opacity-50"
          >
            <Trash2 className="h-5 w-5 text-destructive" />
            <span className="text-[10px] text-destructive">Delete</span>
          </button>
        </div>
        {/* Safe area spacer */}
        <div style={{ height: 'var(--safe-area-bottom)' }} />
      </div>
    </>
  );
}
