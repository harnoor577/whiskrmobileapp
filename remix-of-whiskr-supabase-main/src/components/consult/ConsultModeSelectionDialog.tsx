import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { ActiveRecordingDialog } from "./ActiveRecordingDialog";
import { TypeDetailsDialog, ConsultFormData } from "./TypeDetailsDialog";
import { UploadMedicalHistoryDialog, ExtractedPatientInfo } from "./UploadMedicalHistoryDialog";
import { ReportGenerationOverlay } from "./ReportGenerationOverlay";
import { parsePatientIdentification, ParsedPatientInfo } from "@/utils/patientInfoParser";
import { FileUp, Loader2, Mic, Pencil } from "lucide-react";
import { captureLocationSilently, isDespia } from "@/lib/despia";
import { logReportGenerated } from "@/lib/auditLogger";
import { getUserTimezone } from "@/lib/timezone";

interface ConsultModeSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  patientUUID: string | null;
  patientInfo: {
    id: string;
    name: string;
    species: string;
    breed?: string;
    owner_id?: string;
  } | null;
}

export function ConsultModeSelectionDialog({
  open,
  onOpenChange,
  patientId,
  patientUUID,
  patientInfo,
}: ConsultModeSelectionDialogProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { clinicId, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [selectedMode, setSelectedMode] = useState<"recording" | "typing" | "upload" | null>(null);
  const [showRecordingDialog, setShowRecordingDialog] = useState(false);
  const [showTypeDetailsDialog, setShowTypeDetailsDialog] = useState(false);
  const [showUploadHistoryDialog, setShowUploadHistoryDialog] = useState(false);
  const [createdConsultId, setCreatedConsultId] = useState<string | null>(null);
  // Track patient created during this dialog session (persists across mode switches)
  const [createdPatientInfo, setCreatedPatientInfo] = useState<{
    id: string;
    name: string;
    species: string;
    owner_id: string;
  } | null>(null);

  // New state for transcription and SOAP generation
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isGeneratingSOAP, setIsGeneratingSOAP] = useState(false);
  const [isGenerationComplete, setIsGenerationComplete] = useState(false);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setLoading(false);
      setSelectedMode(null);
      setShowRecordingDialog(false);
      setShowTypeDetailsDialog(false);
      setShowUploadHistoryDialog(false);
      setCreatedConsultId(null);
      setCreatedPatientInfo(null);
      setIsTranscribing(false);
      setIsGeneratingSOAP(false);
      setIsGenerationComplete(false);
    }
  }, [open]);

  const createConsult = async (): Promise<string | null> => {
    if (!clinicId || !user || !patientId) return null;

    try {
      let finalPatientId: string;
      let ownerId: string;

      // Use existing patient from props OR previously created patient in this session
      const existingPatient = patientInfo || createdPatientInfo;

      if (existingPatient) {
        // Use existing patient
        finalPatientId = existingPatient.id;
        ownerId = existingPatient.owner_id || "";

        // Clear any newly created patient flag since we're using existing
        sessionStorage.removeItem("newlyCreatedPatientId");

        // If we don't have owner_id, fetch it
        if (!ownerId) {
          const { data: fullPatient } = await supabase
            .from("patients")
            .select("owner_id")
            .eq("id", finalPatientId)
            .single();
          ownerId = fullPatient?.owner_id || "";
        }
      } else {
        // Create new patient with default owner
        const { data: owner, error: ownerError } = await supabase
          .from("owners")
          .insert({
            clinic_id: clinicId,
            name: "Unknown Owner",
          })
          .select()
          .single();

        if (ownerError) throw ownerError;
        ownerId = owner.id;

        const { data: patient, error: patientError } = await supabase
          .from("patients")
          .insert({
            clinic_id: clinicId,
            owner_id: ownerId,
            name: "New Patient",
            species: "Unknown",
            identifiers: { patient_id: patientId },
          })
          .select()
          .single();

        if (patientError) throw patientError;
        finalPatientId = patient.id;

        // Store created patient so we don't recreate on mode switch
        setCreatedPatientInfo({
          id: patient.id,
          name: "New Patient",
          species: "Unknown",
          owner_id: ownerId,
        });

        // Mark this patient as newly created for cleanup on discard
        sessionStorage.setItem("newlyCreatedPatientId", patient.id);
      }

      // Check for existing draft from today
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: existingDrafts } = await supabase
        .from("consults")
        .select("id")
        .eq("patient_id", finalPatientId)
        .eq("status", "draft")
        .gte("started_at", today.toISOString())
        .limit(1);

      if (existingDrafts && existingDrafts.length > 0) {
        return existingDrafts[0].id;
      }

      // Create new consult
      const { data: consult, error: consultError } = await supabase
        .from("consults")
        .insert({
          clinic_id: clinicId,
          patient_id: finalPatientId,
          owner_id: ownerId,
          status: "draft",
        })
        .select()
        .single();

      if (consultError) throw consultError;

      // Silently capture GPS location on native app (async, non-blocking)
      // Location is stored in sessionStorage for now since clinic_location column doesn't exist
      if (isDespia() && consult?.id) {
        captureLocationSilently().then((location) => {
          if (location) {
            console.log("GPS captured:", location);
            sessionStorage.setItem(`consult_location_${consult.id}`, location);
          }
        });
      }

      return consult.id;
    } catch (error: any) {
      console.error("Error creating consult:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      return null;
    }
  };

  const handleModeSelect = async (mode: "recording" | "typing" | "upload") => {
    if (!clinicId || !user || !patientId) return;

    setSelectedMode(mode);
    setLoading(true);

    // Reuse existing consult if we already created one in this session
    let consultId = createdConsultId;
    if (!consultId) {
      consultId = await createConsult();

      if (!consultId) {
        setSelectedMode(null);
        setLoading(false);
        return;
      }

      setCreatedConsultId(consultId);
    }

    if (mode === "recording") {
      // Show the recording dialog instead of navigating
      setShowRecordingDialog(true);
      setLoading(false);
    } else if (mode === "typing") {
      // Show the type details form dialog
      setShowTypeDetailsDialog(true);
      setLoading(false);
    } else if (mode === "upload") {
      // Show the upload medical history dialog
      setShowUploadHistoryDialog(true);
      setLoading(false);
    }
  };

  // Generate SOAP and navigate to editor - always proceeds to editor, with empty sections on failure
  const generateSOAPAndNavigate = async (transcription: string) => {
    if (!createdConsultId || !clinicId) return;

    setIsGeneratingSOAP(true);

    // Helper to create empty SOAP and proceed
    const proceedWithEmptySOAP = (toastTitle: string, toastDescription: string) => {
      toast({
        title: toastTitle,
        description: toastDescription,
      });
      const emptySOAP = {
        soap: {
          subjective: "",
          objective: "",
          assessment: "",
          plan: "",
        },
        consultId: createdConsultId,
      };
      sessionStorage.setItem(`generated_soap_data_${createdConsultId}`, JSON.stringify(emptySOAP));
      setIsGenerationComplete(true);
    };

    try {
      // Check for very short input - proceed with empty SOAP
      if (!transcription || transcription.trim().length < 10) {
        proceedWithEmptySOAP("Recording Too Short", "You'll be taken to the editor to add information.");
        return;
      }

      // Call generate-soap edge function
      const { data, error } = await supabase.functions.invoke("generate-soap", {
        body: {
          consultId: createdConsultId,
          transcription: transcription.trim(),
          timezone: getUserTimezone(),
        },
      });

      // If error or insufficient data, proceed with empty SOAP
      if (error || data?.error === "INSUFFICIENT_CLINICAL_DATA" || data?.soap?.error === "INSUFFICIENT_CLINICAL_DATA") {
        console.log("SOAP generation incomplete, proceeding with empty editor");
        proceedWithEmptySOAP(
          "Limited Information Detected",
          "You can add more details in the editor or continue recording.",
        );
        return;
      }

      // Success - store the generated SOAP
      sessionStorage.setItem(
        `generated_soap_data_${createdConsultId}`,
        JSON.stringify({ ...data, consultId: createdConsultId }),
      );

      setIsGenerationComplete(true);
    } catch (error: any) {
      console.error("SOAP generation error:", error);
      // Even on catch, proceed to editor with empty SOAP
      proceedWithEmptySOAP("Generation Issue", "You can manually add information in the editor.");
    }
  };

  // Handle agree button on disclaimer overlay
  const handleAgreeAndContinue = async () => {
    if (!createdConsultId || !clinicId) return;

    // Log for compliance tracking
    await logReportGenerated({
      clinicId,
      consultId: createdConsultId,
      reportType: "soap",
      patientId: patientInfo?.id || createdPatientInfo?.id,
      patientName: patientInfo?.name || createdPatientInfo?.name,
      inputMode: (sessionStorage.getItem(`inputMode_${createdConsultId}`) as "recording" | "typed") || "recording",
    });

    // Close dialog and navigate
    onOpenChange(false);
    navigate(`/soap-editor/${createdConsultId}`);
  };

  const handleTypeDetailsSubmit = async (formData: ConsultFormData) => {
    if (!createdConsultId) return;

    // Parse patient information from the identification field
    const parsedPatient = parsePatientIdentification(formData.patientIdentification);

    // Update patient info in database if parsed
    if (parsedPatient.name || parsedPatient.sex || parsedPatient.age || parsedPatient.species || parsedPatient.breed) {
      try {
        // Get the patient ID from the consult
        const { data: consult } = await supabase
          .from("consults")
          .select("patient_id")
          .eq("id", createdConsultId)
          .single();

        if (consult?.patient_id) {
          // Build update object with all parsed fields
          const updateData: Record<string, string> = {};
          if (parsedPatient.name) updateData.name = parsedPatient.name;
          if (parsedPatient.sex) updateData.sex = parsedPatient.sex;
          if (parsedPatient.age) updateData.age = parsedPatient.age;
          if (parsedPatient.species) updateData.species = parsedPatient.species;
          if (parsedPatient.breed) updateData.breed = parsedPatient.breed;

          await supabase.from("patients").update(updateData).eq("id", consult.patient_id);

          // Trigger background enrichment for deeper AI analysis
          supabase.functions
            .invoke("enrich-patient-details", {
              body: { patientId: consult.patient_id },
            })
            .catch((err) => console.log("Background patient enrichment:", err));
        }
      } catch (error) {
        console.error("Error updating patient info:", error);
      }
    }

    // Clear any previous consultation data first (before setting new data) - use scoped keys
    sessionStorage.removeItem(`pendingRecording_${createdConsultId}`);
    sessionStorage.removeItem(`pendingRecordingDuration_${createdConsultId}`);
    sessionStorage.removeItem(`uploadedDiagnosticsCount_${createdConsultId}`);
    sessionStorage.removeItem(`parsedPatientInfo_${createdConsultId}`);
    sessionStorage.removeItem(`pendingTranscription_${createdConsultId}`);

    // Store parsed data in sessionStorage for immediate display - use scoped key
    sessionStorage.setItem(
      `parsedPatientInfo_${createdConsultId}`,
      JSON.stringify({
        name: parsedPatient.name,
        sex: parsedPatient.sex,
        age: parsedPatient.age,
        species: parsedPatient.species,
        breed: parsedPatient.breed,
      }),
    );

    // Check if this is raw typed input (only presentingComplaint has content)
    const isRawInput =
      formData.presentingComplaint.trim().length > 0 &&
      !formData.patientIdentification.trim() &&
      !formData.vitals.trim() &&
      !formData.physicalExamination.trim() &&
      !formData.diagnostics.trim() &&
      !formData.ownerConstraints?.trim();

    let formattedMessage: string;

    if (isRawInput) {
      // Store raw input without any headings
      formattedMessage = formData.presentingComplaint.trim();
    } else {
      // Build formatted message only with non-empty sections
      const sections: string[] = [];
      if (formData.patientIdentification.trim()) {
        sections.push(`Patient Identification: ${formData.patientIdentification}`);
      }
      if (formData.presentingComplaint.trim()) {
        sections.push(`Presenting Complaint: ${formData.presentingComplaint}`);
      }
      if (formData.vitals.trim()) {
        sections.push(`Vitals: ${formData.vitals}`);
      }
      if (formData.physicalExamination.trim()) {
        sections.push(`Physical Examination: ${formData.physicalExamination}`);
      }
      if (formData.diagnostics.trim()) {
        sections.push(`Diagnostics: ${formData.diagnostics}`);
      }
      if (formData.ownerConstraints?.trim()) {
        sections.push(`Owner's Constraints: ${formData.ownerConstraints}`);
      }
      formattedMessage = sections.join("\n\n");
    }

    // Store as transcription in sessionStorage (original_input column doesn't exist yet)
    sessionStorage.setItem(`pendingTranscription_${createdConsultId}`, formattedMessage);
    sessionStorage.setItem(`inputMode_${createdConsultId}`, "typed");

    // Save to history_summary as fallback for typed input
    await supabase
      .from("consults")
      .update({
        history_summary: formattedMessage,
      })
      .eq("id", createdConsultId);

    setShowTypeDetailsDialog(false);

    // Generate SOAP automatically
    await generateSOAPAndNavigate(formattedMessage);
  };

  const handleTypeDetailsBack = () => {
    setShowTypeDetailsDialog(false);
    setSelectedMode(null);
    // Keep createdConsultId and createdPatientInfo so we don't recreate on mode switch
  };

  const handleRecordingComplete = async (audioBlob: Blob, duration: number) => {
    if (!createdConsultId) return;

    setShowRecordingDialog(false);
    setIsTranscribing(true);

    try {
      // Convert blob to base64 for transcription
      const reader = new FileReader();

      reader.onloadend = async () => {
        try {
          const base64Audio = (reader.result as string).split(",")[1];

          // Transcribe audio
          const { data, error } = await supabase.functions.invoke("transcribe-audio", {
            body: { audio: base64Audio, consultId: createdConsultId },
          });

          // Even if transcription fails, proceed with empty - user can add content in editor
          const transcription = error ? "" : data?.text || "";
          const segments = !error && data?.segments ? data.segments : [];

          console.log(
            `[ConsultModeSelection] Transcription received: ${transcription.length} chars, ${segments.length} segments`,
          );

          // Set isGeneratingSOAP BEFORE clearing isTranscribing to prevent overlay flicker
          setIsGeneratingSOAP(true);
          setIsTranscribing(false);

          // Save transcription to database (even if empty)
          await supabase
            .from("consults")
            .update({
              original_input: transcription,
              audio_duration_seconds: duration,
            })
            .eq("id", createdConsultId);

          // Save speaker diarization segments to database
          if (segments.length > 0 && createdConsultId) {
            const { data: consultData } = await supabase
              .from("consults")
              .select("clinic_id")
              .eq("id", createdConsultId)
              .single();

            if (consultData?.clinic_id) {
              const { error: segmentError } = await supabase.from("consult_transcription_segments").insert(
                segments.map((seg: any, idx: number) => ({
                  consult_id: createdConsultId,
                  clinic_id: consultData.clinic_id,
                  sequence_number: idx,
                  start_time: seg.start,
                  end_time: seg.end,
                  text: seg.text,
                  speaker: seg.speaker,
                  speaker_id: seg.speaker_id || null,
                })),
              );

              if (segmentError) {
                console.error("Error saving segments:", segmentError);
              } else {
                console.log(`Saved ${segments.length} speaker segments for new consult`);
              }
            }
          }

          // Store in sessionStorage for SOAP editor
          sessionStorage.setItem(`pendingTranscription_${createdConsultId}`, transcription);
          sessionStorage.setItem(`inputMode_${createdConsultId}`, "recording");

          // Clear old recording data
          sessionStorage.removeItem(`pendingRecording_${createdConsultId}`);
          sessionStorage.removeItem(`pendingRecordingDuration_${createdConsultId}`);

          // Generate SOAP automatically - handles empty/short transcriptions gracefully
          await generateSOAPAndNavigate(transcription);
        } catch (err: any) {
          console.error("Transcription error:", err);
          setIsTranscribing(false);
          // Even on error, proceed to editor with empty SOAP
          sessionStorage.setItem(`inputMode_${createdConsultId}`, "recording");
          await generateSOAPAndNavigate("");
        }
      };

      reader.readAsDataURL(audioBlob);
    } catch (error: any) {
      console.error("Processing error:", error);
      toast({
        title: "Error",
        description: "Failed to process recording",
        variant: "destructive",
      });
      setIsTranscribing(false);
    }
  };

  const handleRecordingBack = () => {
    setShowRecordingDialog(false);
    setSelectedMode(null);
    // Keep createdConsultId and createdPatientInfo so we don't recreate on mode switch
  };

  const handleUploadHistoryComplete = (patientUUID: string, extractedInfo: ExtractedPatientInfo) => {
    // Dialog will handle navigation
    onOpenChange(false);
  };

  const handleUploadHistoryBack = () => {
    setShowUploadHistoryDialog(false);
    setSelectedMode(null);
    // Keep createdConsultId and createdPatientInfo so we don't recreate on mode switch
  };

  return (
    <>
      {/* SOAP Generation Overlay - shown immediately when transcribing or generating */}
      <ReportGenerationOverlay
        isVisible={isTranscribing || isGeneratingSOAP}
        reportType="soap"
        isGenerationComplete={isGenerationComplete}
        onAgree={handleAgreeAndContinue}
      />

      <Dialog open={open && !isTranscribing && !isGeneratingSOAP} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[700px] p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
          <DialogHeader className="text-center pb-1 sm:pb-2">
            <DialogTitle className="text-xl">Patient ID: {patientId}</DialogTitle>
            {patientInfo && (
              <p className="text-muted-foreground text-sm mt-1">
                {patientInfo.name} • {patientInfo.species}
                {patientInfo.breed && ` • ${patientInfo.breed}`}
              </p>
            )}
            <p className="text-muted-foreground mt-2">Choose how you'd like to begin</p>
          </DialogHeader>

          {/* Mode Selection Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-3 sm:mt-4">
            {/* Start Recording Card */}
            <Card
              className={`cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-lg bg-card border-2 animate-fade-in ${
                selectedMode === "recording"
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-border hover:border-primary/50"
              } ${loading && selectedMode !== "recording" ? "opacity-50 pointer-events-none" : ""}`}
              style={{ animationDelay: "100ms" }}
              onClick={() => !loading && handleModeSelect("recording")}
            >
              <CardContent className="p-3 sm:p-5 text-center">
                <div className="mb-4 flex justify-center">
                  <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-2xl bg-primary flex items-center justify-center">
                    <Mic className="h-12 w-12 sm:h-14 sm:w-14 text-primary-foreground" />
                  </div>
                </div>
                <h2 className="text-lg font-semibold text-foreground mb-1">Start Recording</h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Record audio. Atlas AI will transcribe and summarize it for you.
                </p>
                {loading && selectedMode === "recording" && (
                  <div className="mt-3 text-sm text-primary font-medium">Starting...</div>
                )}
              </CardContent>
            </Card>

            {/* Type the Details Card */}
            <Card
              className={`cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-lg bg-card border-2 animate-fade-in ${
                selectedMode === "typing"
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-border hover:border-primary/50"
              } ${loading && selectedMode !== "typing" ? "opacity-50 pointer-events-none" : ""}`}
              style={{ animationDelay: "200ms" }}
              onClick={() => !loading && handleModeSelect("typing")}
            >
              <CardContent className="p-3 sm:p-5 text-center">
                <div className="mb-4 flex justify-center">
                  <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-2xl bg-primary flex items-center justify-center">
                    <Pencil className="h-12 w-12 sm:h-14 sm:w-14 text-primary-foreground" />
                  </div>
                </div>
                <h2 className="text-lg font-semibold text-foreground mb-1">Type the Details</h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Manually enter consultation details and notes.
                </p>
                {loading && selectedMode === "typing" && (
                  <div className="mt-3 text-sm text-primary font-medium">Starting...</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Upload Medical History Button - smaller, below cards */}
          <div className="flex justify-center mt-2 animate-fade-in" style={{ animationDelay: "300ms" }}>
            <Button
              variant="outline"
              size="sm"
              className={`gap-2 text-muted-foreground hover:text-foreground ${
                selectedMode === "upload" ? "border-primary text-primary" : ""
              } ${loading && selectedMode !== "upload" ? "opacity-50 pointer-events-none" : ""}`}
              onClick={() => !loading && handleModeSelect("upload")}
              disabled={loading}
            >
              <FileUp className="h-4 w-4" />
              Upload Medical History
              {loading && selectedMode === "upload" && <span className="text-xs ml-1">Starting...</span>}
            </Button>
          </div>
          {/* Active Recording Dialog */}
          <ActiveRecordingDialog
            open={showRecordingDialog}
            onOpenChange={setShowRecordingDialog}
            onRecordingComplete={handleRecordingComplete}
            onBack={handleRecordingBack}
            patientId={patientId}
            patientInfo={
              patientInfo
                ? {
                    name: patientInfo.name,
                    species: patientInfo.species,
                    breed: patientInfo.breed,
                  }
                : null
            }
          />

          {/* Type Details Form Dialog */}
          <TypeDetailsDialog
            open={showTypeDetailsDialog}
            onOpenChange={setShowTypeDetailsDialog}
            patientId={patientId}
            onSubmit={handleTypeDetailsSubmit}
            onBack={handleTypeDetailsBack}
            isLoading={loading}
          />

          {/* Upload Medical History Dialog */}
          {createdConsultId && (
            <UploadMedicalHistoryDialog
              open={showUploadHistoryDialog}
              onOpenChange={setShowUploadHistoryDialog}
              consultId={createdConsultId}
              patientId={patientUUID || createdPatientInfo?.id || ""}
              onComplete={handleUploadHistoryComplete}
              onBack={handleUploadHistoryBack}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
