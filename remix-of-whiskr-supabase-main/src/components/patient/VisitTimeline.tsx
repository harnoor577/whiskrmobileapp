import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Clock, Trash2, Heart, FileText, Copy, Check, FileUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { isEuthanasiaConsult } from "@/utils/euthanasiaDetection";
import { DischargeSummaryDisplay } from "./DischargeSummaryDisplay";
import { MedicalHistoryDisplay } from "./MedicalHistoryDisplay";
import { PatientDocumentsDialog } from "./PatientDocumentsDialog";
import { MedicalHistoryDetailDrawer } from "./MedicalHistoryDetailDrawer";
import { UploadMedicalHistoryDialog } from "@/components/consult/UploadMedicalHistoryDialog";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { prefetchCaseSummary } from "@/hooks/use-prefetch";

interface Consult {
  id: string;
  created_at: string;
  status: string;
  reason_for_visit?: string | null;
  visit_type?: string | null;
  soap_s?: string | null;
  soap_o?: string | null;
  soap_a?: string | null;
  soap_p?: string | null;
  case_notes?: string | null;
  discharge_summary?: string | null;
  clinical_summary?: string | null;
  weight_kg?: number | null;
  weight_lb?: number | null;
  vitals_temperature?: number | null;
  vitals_heart_rate?: number | null;
  vitals_respiratory_rate?: number | null;
}

interface VisitTimelineProps {
  consults: Consult[];
  weightUnit: 'kg' | 'lb';
  canDeleteConsult: boolean;
  patientId: string;
  clinicId: string;
  onDeleteConsult: (consultId: string) => void;
  embedded?: boolean;
}

export function VisitTimeline({ 
  consults, 
  weightUnit, 
  canDeleteConsult, 
  patientId,
  clinicId,
  onDeleteConsult,
  embedded = false,
}: VisitTimelineProps) {
  const navigate = useNavigate();
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [medicalHistoryDrawerOpen, setMedicalHistoryDrawerOpen] = useState(false);
  const [selectedMedicalHistoryConsultId, setSelectedMedicalHistoryConsultId] = useState<string | null>(null);
  const [uploadHistoryOpen, setUploadHistoryOpen] = useState(false);
  const [createdConsultIdForUpload, setCreatedConsultIdForUpload] = useState<string | null>(null);
  const [isCreatingConsult, setIsCreatingConsult] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const handleUploadMedicalHistory = async () => {
    if (!clinicId || !user || !patientId) return;
    
    setIsCreatingConsult(true);
    
    try {
      // Get patient's owner_id
      const { data: patient } = await supabase
        .from('patients')
        .select('owner_id')
        .eq('id', patientId)
        .single();
      
      if (!patient?.owner_id) {
        throw new Error('Patient owner not found');
      }
      
      // Create new consult for medical history upload
      const { data: consult, error } = await supabase
        .from('consults')
        .insert({
          clinic_id: clinicId,
          patient_id: patientId,
          owner_id: patient.owner_id,
          status: 'draft',
        })
        .select()
        .single();
      
      if (error) throw error;
      
      setCreatedConsultIdForUpload(consult.id);
      setUploadHistoryOpen(true);
    } catch (error: any) {
      console.error('Error creating consult for upload:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to start upload',
        variant: 'destructive',
      });
    } finally {
      setIsCreatingConsult(false);
    }
  };

  const handleUploadComplete = () => {
    setUploadHistoryOpen(false);
    setCreatedConsultIdForUpload(null);
    // Navigate to patient page with timestamp to trigger refresh
    navigate(`/patients/${patientId}?t=${Date.now()}`);
  };

  const handleUploadBack = () => {
    setUploadHistoryOpen(false);
    setCreatedConsultIdForUpload(null);
  };

  const handleCopyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      toast({
        title: "Copied!",
        description: "Consult ID copied to clipboard",
      });
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast({
        title: "Failed to copy",
        variant: "destructive",
      });
    }
  };

  const handleViewOrContinue = (consult: Consult) => {
    // Check if this is a medical history import by looking at case_notes
    if (isMedicalHistoryImport(consult)) {
      setSelectedMedicalHistoryConsultId(consult.id);
      setMedicalHistoryDrawerOpen(true);
      return;
    }

    if (consult.status === 'draft') {
      // Clear stale sessionStorage from previous consults to prevent data mixing
      sessionStorage.removeItem('pendingTranscription');
      sessionStorage.removeItem('parsedPatientInfo');
      sessionStorage.removeItem('uploadedDiagnosticsCount');
      sessionStorage.removeItem('pendingRecording');
      sessionStorage.removeItem('pendingRecordingDuration');
      
      sessionStorage.setItem('inputMode', 'continue');
      
      // Check what report data exists
      const hasSOAP = consult.soap_s || consult.soap_o || consult.soap_a || consult.soap_p;
      
      let hasWellness = false;
      let hasProcedure = false;
      
      if (consult.case_notes) {
        try {
          const parsed = JSON.parse(consult.case_notes);
          hasWellness = !!parsed.wellness;
          hasProcedure = !!parsed.procedure;
        } catch {
          // Not JSON, ignore
        }
      }
      
      // Navigate to appropriate editor based on existing data
      if (hasSOAP) {
        navigate(`/soap-editor/${consult.id}`);
      } else if (hasWellness) {
        navigate(`/wellness-editor/${consult.id}`);
      } else if (hasProcedure) {
        navigate(`/procedure-editor/${consult.id}`);
      } else {
        // No report generated yet - go to post-recording to choose
        navigate(`/post-recording/${consult.id}`);
      }
    } else {
      // Finalized consults go to case summary
      navigate(`/case-summary/${consult.id}`);
    }
  };

  const isMedicalHistoryImport = (consult: Consult): boolean => {
    if (!consult.case_notes) return false;
    try {
      const parsed = JSON.parse(consult.case_notes);
      return !!parsed.imported_medical_history;
    } catch {
      return false;
    }
  };

  const header = (
    <div className={`flex items-center justify-between ${embedded ? 'pb-3' : 'p-4 md:p-6 pb-3'}`}>
      <div className="flex items-center gap-2">
        <Clock className="h-5 w-5 text-primary" />
        <div>
          <h3 className="text-lg md:text-xl font-semibold">Visit Timeline</h3>
          <p className="text-xs md:text-sm text-muted-foreground">
            {consults.length} visit{consults.length !== 1 ? 's' : ''} on record
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleUploadMedicalHistory}
          disabled={isCreatingConsult}
          className="gap-1.5"
        >
          <FileUp className="h-4 w-4" />
          <span className="hidden sm:inline">Upload History</span>
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setDocumentsOpen(true)}
          className="gap-1.5"
        >
          <FileText className="h-4 w-4" />
          <span className="hidden sm:inline">Documents</span>
        </Button>
      </div>
    </div>
  );

  const timelineContent = (
    <div className="p-0">
        {consults.length === 0 ? (
          <p className="text-muted-foreground text-sm italic py-8 px-4 md:px-6 text-center">
            No visit history available
          </p>
        ) : (
          <div className="space-y-0">
            {consults.map((consult, index) => (
              <div 
                key={consult.id} 
                className="relative px-4 md:px-6 py-4 md:py-5 border-b last:border-b-0 hover:bg-accent/30 transition-colors"
              >
                {/* Timeline indicator line */}
                {index < consults.length - 1 && (
                  <div className="absolute left-[30px] md:left-[38px] top-12 bottom-0 w-0.5 bg-gradient-to-b from-primary/30 to-transparent" />
                )}
                
                <div className="flex gap-3 md:gap-4">
                  {/* Timeline dot */}
                  <div className="flex-shrink-0 mt-1">
                    <div className="w-3 h-3 md:w-4 md:h-4 rounded-full bg-primary border-2 border-background shadow-sm ring-2 ring-primary/20" />
                  </div>
                  
                  <div className="flex-1 min-w-0 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col xs:flex-row xs:items-center gap-1.5 xs:gap-2 mb-1.5 flex-wrap">
                          <p className="font-semibold text-sm md:text-base text-foreground">
                            {isMedicalHistoryImport(consult) 
                              ? `${format(new Date(consult.created_at), "MMM d, yyyy")} | Patient History`
                              : format(new Date(consult.created_at), "MMM d, yyyy")}
                          </p>
                          {!isMedicalHistoryImport(consult) && (
                            <Badge 
                              variant="outline" 
                              className={`text-xs w-fit ${consult.status === "finalized" 
                                ? "bg-success/10 text-success border-success/30" 
                                : "bg-warning/10 text-warning border-warning/30"
                              }`}
                            >
                              {consult.status.toUpperCase()}
                            </Badge>
                          )}
                          {isEuthanasiaConsult(consult) && (
                            <Badge 
                              variant="outline" 
                              className="bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-200 dark:border-purple-800 text-xs flex items-center gap-1 w-fit"
                            >
                              <Heart className="h-3 w-3" />
                              Euthanasia
                            </Badge>
                          )}
                        </div>
                        
                        {/* Consult ID - Clickable to copy */}
                        <button
                          onClick={() => handleCopyId(consult.id)}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors group mt-1"
                        >
                          <span className="font-mono text-[10px]">ID: {consult.id}</span>
                          {copiedId === consult.id ? (
                            <Check className="h-3 w-3 text-success" />
                          ) : (
                            <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          )}
                        </button>
                        
                        {/* Collapsible Summary Display */}
                        <div className="mt-1">
                          {isMedicalHistoryImport(consult) ? (
                            <MedicalHistoryDisplay 
                              caseNotes={consult.case_notes}
                              consultId={consult.id}
                              clinicalSummary={consult.clinical_summary}
                            />
                          ) : (
                            <DischargeSummaryDisplay 
                              dischargeSummary={consult.discharge_summary}
                              consultId={consult.id}
                              clinicalSummary={consult.clinical_summary}
                            />
                          )}
                        </div>
                      </div>
                      
                      <div className="flex gap-1.5 flex-shrink-0">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => onDeleteConsult(consult.id)}
                                  disabled={!canDeleteConsult}
                                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </span>
                            </TooltipTrigger>
                            {!canDeleteConsult && (
                              <TooltipContent>
                                <p>Only vets or techs can delete consultations</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                        <Button 
                          variant="default" 
                          size="sm" 
                          className="h-8 text-xs px-3"
                          onClick={() => handleViewOrContinue(consult)}
                          onMouseEnter={() => consult.status === 'finalized' && prefetchCaseSummary(consult.id)}
                          onTouchStart={() => consult.status === 'finalized' && prefetchCaseSummary(consult.id)}
                        >
                          {consult.status === 'finalized' || isMedicalHistoryImport(consult) ? 'View' : 'Continue'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );

  return (
    <>
      {embedded ? (
        <div>
          {header}
          {timelineContent}
        </div>
      ) : (
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-3">{header}</CardHeader>
          <CardContent className="p-0">{timelineContent}</CardContent>
        </Card>
      )}

    <PatientDocumentsDialog
      open={documentsOpen}
      onOpenChange={setDocumentsOpen}
      patientId={patientId}
      clinicId={clinicId}
    />

    {selectedMedicalHistoryConsultId && (
      <MedicalHistoryDetailDrawer
        open={medicalHistoryDrawerOpen}
        onOpenChange={setMedicalHistoryDrawerOpen}
        consultId={selectedMedicalHistoryConsultId}
        patientId={patientId}
      />
    )}

    {createdConsultIdForUpload && (
      <UploadMedicalHistoryDialog
        open={uploadHistoryOpen}
        onOpenChange={setUploadHistoryOpen}
        consultId={createdConsultIdForUpload}
        patientId={patientId}
        onComplete={handleUploadComplete}
        onBack={handleUploadBack}
      />
    )}
  </>
  );
}
