import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/hooks/use-permissions";
import { useUserTemplates } from "@/hooks/use-user-templates";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  ArrowLeft,
  FileText,
  Stethoscope,
  ClipboardList,
  Mic,
  StickyNote,
  FileOutput,
  Loader2,
  Mail,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Copy,
  BookOpen,
  MoreVertical,
  MessageSquare,
  FlaskConical,
  PanelLeftClose,
  PanelLeft,
  Check,
  Pill,
  Home,
  PawPrint,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CaseNotesSection } from "@/components/chat/CaseNotesSection";
import { MinimizableAtlasChat } from "@/components/chat/MinimizableAtlasChat";
import { DiagnosticsSection } from "@/components/patient/DiagnosticsSection";
import { SectionDetailDialog } from "@/components/consult/SectionDetailDialog";
import { CopySectionButton } from "@/components/consult/CopySectionButton";
import { CaseSummarySidePanel } from "@/components/consult/CaseSummarySidePanel";
import { MedicationProfileDialog } from "@/components/consult/MedicationProfileDialog";
import { MedicineSelectorDialog } from "@/components/consult/MedicineSelectorDialog";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { stripMarkdown, stripMarkdownCompact } from "@/utils/stripMarkdown";
import { HighlightedContent, stripAbnormalMarkers } from "@/components/soap/HighlightedContent";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { copyToClipboard, isIOS } from "@/utils/clipboard";
import { CopyFallbackDialog } from "@/components/ui/CopyFallbackDialog";
import { AtlasEye } from "@/components/ui/AtlasEye";
import { ClinicInfo, VetInfo } from "@/utils/pdfExport";
import { useIsMobile } from "@/hooks/use-mobile";
import { extractMedicationsFromConsult, type ExtractedMedication } from "@/utils/medicationExtractor";
import { type MedicationProfile } from "@/utils/medicationPdfGenerator";
import { getCachedData, setCacheData } from "@/hooks/use-prefetch";
import { CaseSummarySkeleton } from "@/components/patient/CaseSummarySkeleton";
import { DraftEmailDialog } from "@/components/consult/DraftEmailDialog";

// Format nested JSON object to readable text (for safety if AI returns nested object)
function formatNestedObjectToText(obj: Record<string, unknown>): string {
  const lines: string[] = [];

  for (const [category, content] of Object.entries(obj)) {
    const categoryTitle = category
      .replace(/_/g, " ")
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    lines.push(`${categoryTitle}:`);

    if (typeof content === "object" && content !== null) {
      for (const [key, value] of Object.entries(content as Record<string, unknown>)) {
        const keyName = key.replace(/_/g, " ");
        if (typeof value === "object" && value !== null) {
          for (const [subKey, subValue] of Object.entries(value as Record<string, unknown>)) {
            lines.push(`  • ${subKey.replace(/_/g, " ")}: ${subValue}`);
          }
        } else {
          lines.push(`  • ${keyName}: ${value}`);
        }
      }
      lines.push("");
    } else {
      lines.push(`  ${content}`);
      lines.push("");
    }
  }

  return lines.join("\n").trim();
}

// Format content that might be JSON
function formatContentSafely(content: string | null): string {
  if (!content) return "";

  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null) {
        return stripMarkdown(formatNestedObjectToText(parsed));
      }
    } catch {
      // Not valid JSON, continue
    }
  }

  return stripMarkdown(content);
}

interface ConsultData {
  id: string;
  patient_id: string;
  visit_type: string | null;
  status: string | null;
  created_at: string;
  started_at?: string | null;
  soap_s: string | null;
  soap_o: string | null;
  soap_a: string | null;
  soap_p: string | null;
  case_notes: string | null;
  original_input: string | null;
  clinic_id: string;
  discharge_summary: string | null;
  client_education: string | null;
}

interface PatientInfo {
  name: string;
  species: string;
  breed: string | null;
  identifiers: unknown;
  sex?: string | null;
  age?: string | null;
  date_of_birth?: string | null;
}

type DialogType = "original" | "caseNotes" | "discharge" | "drCatScan" | "education" | null;

interface DischargeSections {
  summary: string;
  keyFindings: string;
  treatmentPlan: string;
  signsToWatch: string;
  followUp: string;
}

function parseDischargeSections(content: string): DischargeSections {
  const sections: DischargeSections = {
    summary: "",
    keyFindings: "",
    treatmentPlan: "",
    signsToWatch: "",
    followUp: "",
  };

  const patterns = [
    {
      key: "summary" as const,
      pattern: /(?:\d+\.\s*)?SUMMARY[:\s]*\n([\s\S]*?)(?=(?:\d+\.\s*)?KEY FINDINGS[:\s]*\n|$)/i,
    },
    {
      key: "keyFindings" as const,
      pattern:
        /(?:\d+\.\s*)?KEY FINDINGS[:\s]*\n([\s\S]*?)(?=(?:\d+\.\s*)?TREATMENT PLAN AND CARE INSTRUCTIONS[:\s]*\n|$)/i,
    },
    {
      key: "treatmentPlan" as const,
      pattern:
        /(?:\d+\.\s*)?TREATMENT PLAN AND CARE INSTRUCTIONS[:\s]*\n([\s\S]*?)(?=(?:\d+\.\s*)?SIGNS TO WATCH FOR[:\s]*\n|$)/i,
    },
    {
      key: "signsToWatch" as const,
      pattern: /(?:\d+\.\s*)?SIGNS TO WATCH FOR[:\s]*\n([\s\S]*?)(?=(?:\d+\.\s*)?FOLLOW-UP STEPS[:\s]*\n|$)/i,
    },
    { key: "followUp" as const, pattern: /(?:\d+\.\s*)?FOLLOW-UP STEPS[:\s]*\n([\s\S]*?)$/i },
  ];

  for (const { key, pattern } of patterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      sections[key] = match[1].trim();
    }
  }

  return sections;
}

interface EducationSections {
  whatIsCondition: string;
  causesRisk: string;
  understandingTreatment: string;
  recovery: string;
  homeCare: string;
  prevention: string;
  whenToContact: string;
}

function parseEducationSections(content: string): EducationSections {
  const sections: EducationSections = {
    whatIsCondition: "",
    causesRisk: "",
    understandingTreatment: "",
    recovery: "",
    homeCare: "",
    prevention: "",
    whenToContact: "",
  };

  const patterns = [
    {
      key: "whatIsCondition" as const,
      pattern: /(?:1\.\s*)?WHAT IS THIS CONDITION\?[:\s]*\n([\s\S]*?)(?=(?:2\.\s*)?CAUSES AND RISK FACTORS[:\s]*\n|$)/i,
    },
    {
      key: "causesRisk" as const,
      pattern:
        /(?:2\.\s*)?CAUSES AND RISK FACTORS[:\s]*\n([\s\S]*?)(?=(?:3\.\s*)?UNDERSTANDING THE TREATMENT[:\s]*\n|$)/i,
    },
    {
      key: "understandingTreatment" as const,
      pattern:
        /(?:3\.\s*)?UNDERSTANDING THE TREATMENT[:\s]*\n([\s\S]*?)(?=(?:4\.\s*)?WHAT TO EXPECT DURING RECOVERY[:\s]*\n|$)/i,
    },
    {
      key: "recovery" as const,
      pattern: /(?:4\.\s*)?WHAT TO EXPECT DURING RECOVERY[:\s]*\n([\s\S]*?)(?=(?:5\.\s*)?HOME CARE TIPS[:\s]*\n|$)/i,
    },
    {
      key: "homeCare" as const,
      pattern: /(?:5\.\s*)?HOME CARE TIPS[:\s]*\n([\s\S]*?)(?=(?:6\.\s*)?PREVENTION AND LONG-TERM CARE[:\s]*\n|$)/i,
    },
    {
      key: "prevention" as const,
      pattern:
        /(?:6\.\s*)?PREVENTION AND LONG-TERM CARE[:\s]*\n([\s\S]*?)(?=(?:7\.\s*)?WHEN TO CONTACT YOUR VETERINARIAN[:\s]*\n|$)/i,
    },
    { key: "whenToContact" as const, pattern: /(?:7\.\s*)?WHEN TO CONTACT YOUR VETERINARIAN[:\s]*\n([\s\S]*?)$/i },
  ];

  for (const { key, pattern } of patterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      sections[key] = match[1].trim();
    }
  }

  return sections;
}

export default function CaseSummary() {
  const { consultId } = useParams<{ consultId: string }>();
  const navigate = useNavigate();
  const { clinicId, user } = useAuth();
  const { canUnfinalizeConsult } = usePermissions();
  const { getActiveTemplate } = useUserTemplates();

  // Get active templates for each report type
  const activeSOAPTemplate = getActiveTemplate("soap");
  const activeWellnessTemplate = getActiveTemplate("wellness");
  const activeProcedureTemplate = getActiveTemplate("procedure");

  // Helper to check if a section is enabled in the template
  const isSectionEnabled = useCallback(
    (templateType: "soap" | "wellness" | "procedure", sectionId: string) => {
      const template =
        templateType === "soap"
          ? activeSOAPTemplate
          : templateType === "wellness"
            ? activeWellnessTemplate
            : activeProcedureTemplate;

      if (!template) return true; // Show all if no template configured
      const section = template.sections?.find((s) => s.id === sectionId);
      return section?.enabled !== false;
    },
    [activeSOAPTemplate, activeWellnessTemplate, activeProcedureTemplate],
  );

  const [consult, setConsult] = useState<ConsultData | null>(null);
  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState<DialogType>(null);
  const [caseNotesKey, setCaseNotesKey] = useState(0);
  const [isGeneratingDischarge, setIsGeneratingDischarge] = useState(false);
  const [showDraftEmailDialog, setShowDraftEmailDialog] = useState(false);
  const [showCopyFallback, setShowCopyFallback] = useState(false);
  const [fallbackText, setFallbackText] = useState("");
  const [messageCount, setMessageCount] = useState(0);
  const [selectedReportType, setSelectedReportType] = useState<"soap" | "wellness" | "procedure" | null>(null);
  const [isUnfinalizing, setIsUnfinalizing] = useState(false);
  const [isGeneratingEducation, setIsGeneratingEducation] = useState(false);
  const [diagnostics, setDiagnostics] = useState<any[]>([]);
  const [showDiagnosticsDialog, setShowDiagnosticsDialog] = useState(false);
  const [clinicInfo, setClinicInfo] = useState<ClinicInfo | null>(null);
  const [vetInfo, setVetInfo] = useState<VetInfo | null>(null);
  const [assignedUserName, setAssignedUserName] = useState<string | null>(null);
  const [assignedUserPrefix, setAssignedUserPrefix] = useState<string>("Dr.");
  const [consultStartedAt, setConsultStartedAt] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const [copiedConsultId, setCopiedConsultId] = useState(false);

  // Medicine Summary state
  const [extractedMedications, setExtractedMedications] = useState<ExtractedMedication[]>([]);
  const [selectedMedication, setSelectedMedication] = useState<string | null>(null);
  const [medicationProfile, setMedicationProfile] = useState<MedicationProfile | null>(null);
  const [showMedicationDialog, setShowMedicationDialog] = useState(false);
  const [isGeneratingMedProfile, setIsGeneratingMedProfile] = useState(false);
  const [showMedicineSelectorDialog, setShowMedicineSelectorDialog] = useState(false);
  const [showSidePanel, setShowSidePanel] = useState(false);

  const handleCopyConsultId = async () => {
    if (!consultId) return;
    try {
      await navigator.clipboard.writeText(consultId);
      setCopiedConsultId(true);
      toast.success("Consult ID copied to clipboard");
      setTimeout(() => setCopiedConsultId(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleAddToCaseNotes = async (content: string) => {
    if (!consultId || !clinicId || !user) return;

    const { error } = await supabase.from("case_notes").insert({
      consult_id: consultId,
      clinic_id: clinicId,
      created_by: user.id,
      note: content,
    });

    if (error) {
      console.error("Error adding to case notes:", error);
      toast.error("Failed to add to case notes");
      return;
    }

    toast.success("Added to Case Notes");
    setCaseNotesKey((prev) => prev + 1);
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!consultId) return;

      // Check cache first for instant display
      interface CaseSummaryCacheData {
        consult: ConsultData;
        patient: PatientInfo | null;
        clinic: ClinicInfo | null;
        diagnostics: any[];
        assignment: { user_id: string } | null;
        assignmentProfile: { name: string; name_prefix: string | null } | null;
      }

      const cached = getCachedData<CaseSummaryCacheData>(`case-summary-${consultId}`);
      if (cached) {
        setConsult(cached.consult);
        setConsultStartedAt(cached.consult.started_at || cached.consult.created_at);
        if (cached.patient) {
          let calculatedAge = cached.patient.age;
          if (!calculatedAge && cached.patient.date_of_birth) {
            const birthDate = new Date(cached.patient.date_of_birth);
            const today = new Date();
            const years = today.getFullYear() - birthDate.getFullYear();
            calculatedAge = String(years);
          }
          setPatient({ ...cached.patient, age: calculatedAge });
        }
        if (cached.clinic) setClinicInfo(cached.clinic);
        if (cached.diagnostics) setDiagnostics(cached.diagnostics);
        if (cached.assignmentProfile) {
          setAssignedUserName(cached.assignmentProfile.name);
          setAssignedUserPrefix(cached.assignmentProfile.name_prefix || "Dr.");
        }
        setIsLoading(false);
        // Continue to revalidate in background but don't block UI
      }

      // Fetch consult data
      const { data: consultData, error: consultError } = await supabase
        .from("consults")
        .select(
          "id, patient_id, visit_type, status, created_at, started_at, soap_s, soap_o, soap_a, soap_p, case_notes, original_input, clinic_id, discharge_summary, client_education",
        )
        .eq("id", consultId)
        .single();

      if (consultError || !consultData) {
        console.error("Error fetching consult:", consultError);
        setIsLoading(false);
        return;
      }

      setConsult(consultData);
      setConsultStartedAt(consultData.started_at || consultData.created_at);

      // Parallel fetch: patient, clinic, diagnostics, assignment
      const [patientResult, clinicResult, diagnosticsResult, assignmentResult, vetProfileResult] = await Promise.all([
        supabase
          .from("patients")
          .select("id, name, species, breed, identifiers, sex, age, date_of_birth, weight_kg, weight_lb")
          .eq("id", consultData.patient_id)
          .single(),
        supabase
          .from("clinics")
          .select("name, address, phone, clinic_email, header_logo_url")
          .eq("id", consultData.clinic_id)
          .single(),
        supabase.from("file_assets").select("*").eq("consult_id", consultId).order("created_at", { ascending: false }),
        supabase.from("consult_assignments").select("user_id").eq("consult_id", consultId).limit(1).maybeSingle(),
        supabase
          .from("profiles")
          .select("name, name_prefix, dvm_role")
          .eq("clinic_id", consultData.clinic_id)
          .limit(1)
          .single(),
      ]);

      const patientData = patientResult.data;
      if (patientData) {
        // Calculate age from date_of_birth if age is not set
        let calculatedAge = patientData.age;
        if (!calculatedAge && patientData.date_of_birth) {
          const birthDate = new Date(patientData.date_of_birth);
          const today = new Date();
          const years = today.getFullYear() - birthDate.getFullYear();
          calculatedAge = String(years);
        }
        setPatient({
          ...patientData,
          age: calculatedAge,
        });

        // Fallback enrichment for incomplete patients
        const isIncomplete =
          !patientData?.name ||
          patientData.name === "New Patient" ||
          !patientData?.species ||
          patientData.species === "Unknown";

        if (isIncomplete && patientData?.id) {
          console.log("Triggering fallback enrichment for incomplete patient");
          supabase.functions
            .invoke("enrich-patient-details", {
              body: { patientId: patientData.id },
            })
            .then(async () => {
              const { data: refreshedPatient } = await supabase
                .from("patients")
                .select("id, name, species, breed, identifiers, sex, age, date_of_birth, weight_kg, weight_lb")
                .eq("id", patientData.id)
                .single();
              if (refreshedPatient) {
                let refreshedAge = refreshedPatient.age;
                if (!refreshedAge && refreshedPatient.date_of_birth) {
                  const birthDate = new Date(refreshedPatient.date_of_birth);
                  const today = new Date();
                  const years = today.getFullYear() - birthDate.getFullYear();
                  refreshedAge = String(years);
                }
                setPatient({
                  ...refreshedPatient,
                  age: refreshedAge,
                });
              }
            })
            .catch((err) => console.log("Fallback enrichment error:", err));
        }
      }

      // Fetch assignment profile if assignment exists
      let assignmentProfile = null;
      if (assignmentResult.data?.user_id) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("name, name_prefix")
          .eq("user_id", assignmentResult.data.user_id)
          .single();

        if (profileData) {
          setAssignedUserName(profileData.name);
          setAssignedUserPrefix((profileData as any).name_prefix || "Dr.");
          assignmentProfile = profileData;
        }
      }

      if (diagnosticsResult.data) {
        setDiagnostics(diagnosticsResult.data);
      }

      if (clinicResult.data) {
        setClinicInfo(clinicResult.data);
      }

      if (vetProfileResult.data) {
        setVetInfo({
          name: vetProfileResult.data.name,
          name_prefix: vetProfileResult.data.name_prefix || "Dr.",
          dvm_role: vetProfileResult.data.dvm_role,
        });
      }

      // Update cache with fresh data
      setCacheData(`case-summary-${consultId}`, {
        consult: consultData,
        patient: patientData,
        clinic: clinicResult.data,
        diagnostics: diagnosticsResult.data || [],
        assignment: assignmentResult.data,
        assignmentProfile,
      });

      setIsLoading(false);
    };

    fetchData();
  }, [consultId]);

  // Auto-generate discharge summary if any report exists but no discharge summary yet
  useEffect(() => {
    const autoGenerateDischarge = async () => {
      if (!consultId || !consult) return;
      if (consult.discharge_summary) return;
      if (isGeneratingDischarge) return;

      const hasSOAPNotes = consult.soap_s || consult.soap_o || consult.soap_a || consult.soap_p;

      let hasWellnessOrProcedure = false;
      if (consult.case_notes) {
        try {
          const parsed = JSON.parse(consult.case_notes);
          hasWellnessOrProcedure = !!(parsed.wellness || parsed.procedure);
        } catch {
          // Not JSON, ignore
        }
      }

      if (!hasSOAPNotes && !hasWellnessOrProcedure) return;

      setIsGeneratingDischarge(true);
      try {
        const { data, error } = await supabase.functions.invoke("generate-discharge-plan", {
          body: { consultId },
        });

        if (error) {
          console.error("Error auto-generating discharge plan:", error);
          return;
        }

        if (data?.dischargePlan) {
          const { data: updatedConsult } = await supabase
            .from("consults")
            .select(
              "id, patient_id, visit_type, status, created_at, soap_s, soap_o, soap_a, soap_p, case_notes, original_input, clinic_id, discharge_summary, client_education",
            )
            .eq("id", consultId)
            .single();

          if (updatedConsult) {
            setConsult(updatedConsult);
          }
        }
      } catch (err) {
        console.error("Error auto-generating discharge:", err);
      } finally {
        setIsGeneratingDischarge(false);
      }
    };

    autoGenerateDischarge();
  }, [
    consultId,
    consult?.soap_s,
    consult?.soap_o,
    consult?.soap_a,
    consult?.soap_p,
    consult?.discharge_summary,
    consult?.case_notes,
  ]);

  const hasSOAP = consult?.soap_s || consult?.soap_o || consult?.soap_a || consult?.soap_p;

  // Parse case_notes JSON for wellness and procedure data
  let wellnessData: Record<string, string> | null = null;
  let procedureData: Record<string, string> | null = null;

  if (consult?.case_notes) {
    try {
      const parsed = JSON.parse(consult.case_notes);
      if (parsed.wellness) wellnessData = parsed.wellness;
      if (parsed.procedure) procedureData = parsed.procedure;
    } catch {
      // Not JSON, ignore
    }
  }

  // Determine primary report type (SOAP > Wellness > Procedure)
  const primaryReportType = useMemo(() => {
    if (hasSOAP) return "soap";
    if (wellnessData) return "wellness";
    if (procedureData) return "procedure";
    return null;
  }, [hasSOAP, wellnessData, procedureData]);

  // Set initial selection when primaryReportType is determined
  useEffect(() => {
    if (primaryReportType && !selectedReportType) {
      setSelectedReportType(primaryReportType);
    }
  }, [primaryReportType, selectedReportType]);

  // Parse discharge summary sections
  const dischargeSections = useMemo(() => {
    if (!consult?.discharge_summary) return null;
    return parseDischargeSections(consult.discharge_summary);
  }, [consult?.discharge_summary]);

  // Parse client education sections
  const educationSections = useMemo(() => {
    if (!consult?.client_education) return null;
    return parseEducationSections(consult.client_education);
  }, [consult?.client_education]);

  // Auto-generate client education if any report exists but no education yet
  useEffect(() => {
    const autoGenerateEducation = async () => {
      if (!consultId || !consult) return;
      if (consult.client_education) return;
      if (isGeneratingEducation) return;

      const hasSOAPNotes = consult.soap_s || consult.soap_o || consult.soap_a || consult.soap_p;

      let hasWellnessOrProcedure = false;
      if (consult.case_notes) {
        try {
          const parsed = JSON.parse(consult.case_notes);
          hasWellnessOrProcedure = !!(parsed.wellness || parsed.procedure);
        } catch {
          // Not JSON, ignore
        }
      }

      if (!hasSOAPNotes && !hasWellnessOrProcedure) return;

      setIsGeneratingEducation(true);
      try {
        const { data, error } = await supabase.functions.invoke("generate-client-education", {
          body: { consultId },
        });

        if (error) {
          console.error("Error auto-generating client education:", error);
          return;
        }

        if (data?.clientEducation) {
          const { data: updatedConsult } = await supabase
            .from("consults")
            .select(
              "id, patient_id, visit_type, status, created_at, soap_s, soap_o, soap_a, soap_p, case_notes, original_input, clinic_id, discharge_summary, client_education",
            )
            .eq("id", consultId)
            .single();

          if (updatedConsult) {
            setConsult(updatedConsult);
          }
        }
      } catch (err) {
        console.error("Error auto-generating education:", err);
      } finally {
        setIsGeneratingEducation(false);
      }
    };

    autoGenerateEducation();
  }, [
    consultId,
    consult?.soap_s,
    consult?.soap_o,
    consult?.soap_a,
    consult?.soap_p,
    consult?.client_education,
    consult?.case_notes,
  ]);

  // Extract medications from consult when data loads
  useEffect(() => {
    if (consult && consult.status === "finalized") {
      const medications = extractMedicationsFromConsult(consult);
      setExtractedMedications(medications);
    }
  }, [consult]);

  // Handler for generating medication profile
  const handleGenerateMedicationProfile = async (drugName: string) => {
    if (!drugName || !patient) return;

    setSelectedMedication(drugName);
    setMedicationProfile(null);
    setShowMedicationDialog(true);
    setIsGeneratingMedProfile(true);

    try {
      const { data, error } = await supabase.functions.invoke("generate-medication-profile", {
        body: {
          drugName,
          patientInfo: {
            species: patient.species,
            breed: patient.breed,
          },
        },
      });

      if (error) {
        console.error("Error generating medication profile:", error);
        toast.error("Failed to generate medication profile");
        setShowMedicationDialog(false);
        return;
      }

      if (data?.profile) {
        setMedicationProfile(data.profile);
      }
    } catch (err) {
      console.error("Error generating medication profile:", err);
      toast.error("Failed to generate medication profile");
      setShowMedicationDialog(false);
    } finally {
      setIsGeneratingMedProfile(false);
    }
  };

  const handleCopyAll = async (content: string, title: string) => {
    const cleanText = stripMarkdown(content);

    if (isIOS()) {
      setFallbackText(cleanText);
      setShowCopyFallback(true);
      return;
    }

    const success = await copyToClipboard(cleanText);
    if (success) {
      toast.success(`${title} copied to clipboard`);
    } else {
      setFallbackText(cleanText);
      setShowCopyFallback(true);
    }
  };

  // Build copy all content for each report type (compact - no extra spacing, filtered by template)
  const soapCopyContent = hasSOAP
    ? `SOAP NOTES\n${consult?.soap_s && isSectionEnabled("soap", "subjective") ? `Subjective:\n${stripAbnormalMarkers(stripMarkdownCompact(consult.soap_s))}\n` : ""}${consult?.soap_o && isSectionEnabled("soap", "objective") ? `Objective:\n${stripAbnormalMarkers(stripMarkdownCompact(formatContentSafely(consult.soap_o)))}\n` : ""}${consult?.soap_a && isSectionEnabled("soap", "assessment") ? `Assessment:\n${stripAbnormalMarkers(stripMarkdownCompact(consult.soap_a))}\n` : ""}${consult?.soap_p && isSectionEnabled("soap", "plan") ? `Plan:\n${stripAbnormalMarkers(stripMarkdownCompact(consult.soap_p))}` : ""}`.trim()
    : "";

  const wellnessCopyContent = wellnessData
    ? `WELLNESS REPORT\n${Object.entries(wellnessData)
        .filter(([key]) => isSectionEnabled("wellness", key))
        .map(
          ([key, value]) =>
            `${key
              .replace(/([a-z])([A-Z])/g, "$1 $2")
              .replace(/_/g, " ")
              .replace(/\b\w/g, (c) =>
                c.toUpperCase(),
              )}:\n${typeof value === "string" ? stripMarkdownCompact(value) : stripMarkdownCompact(JSON.stringify(value, null, 2))}`,
        )
        .join("\n")}`
    : "";

  const procedureCopyContent = procedureData
    ? `PROCEDURAL NOTES\n${Object.entries(procedureData)
        .filter(([key]) => isSectionEnabled("procedure", key))
        .map(
          ([key, value]) =>
            `${key
              .replace(/([a-z])([A-Z])/g, "$1 $2")
              .replace(/_/g, " ")
              .replace(/\b\w/g, (c) =>
                c.toUpperCase(),
              )}:\n${typeof value === "string" ? stripMarkdownCompact(value) : stripMarkdownCompact(JSON.stringify(value, null, 2))}`,
        )
        .join("\n")}`
    : "";

  if (isLoading) {
    return <CaseSummarySkeleton />;
  }

  if (!consult) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-muted-foreground">Consult not found.</p>
          <Button variant="outline" onClick={() => navigate("/dashboard")} className="mt-4">
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const patientId = (patient?.identifiers as Record<string, unknown> | null)?.patient_id as string | undefined;

  // Side panel content for reuse
  const sidePanelContent = (
    <CaseSummarySidePanel
      patientInfo={
        patient
          ? {
              patientId: patientId,
              name: patient.name,
              species: patient.species,
              breed: patient.breed,
              sex: patient.sex,
              age: patient.age,
            }
          : null
      }
      consultDate={consultStartedAt}
      assignedUserName={assignedUserName}
      assignedUserPrefix={assignedUserPrefix}
    />
  );

  // Header component - extracted to render above ResizablePanelGroup
  const headerContent = (
    <div className="border-b border-border bg-card px-2 sm:px-4 py-2 sm:py-3 sticky top-0 z-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Mobile: Sheet for side panel - controlled by bottom nav */}
          {isMobile && (
            <Sheet open={showSidePanel} onOpenChange={setShowSidePanel}>
              <SheetContent side="left" className="p-0 w-[280px]">
                {sidePanelContent}
              </SheetContent>
            </Sheet>
          )}
          <Button variant="ghost" size="icon" onClick={() => navigate(`/patients/${consult.patient_id}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Case Summary</h1>
            <p className="text-muted-foreground text-sm flex items-center gap-1">
              <button
                onClick={handleCopyConsultId}
                className="flex items-center gap-1 font-mono text-[10px] hover:text-foreground transition-colors group"
              >
                <span className="hidden sm:inline">ID: {consultId}</span>
                <span className="sm:hidden">ID: {consultId?.slice(0, 8)}...</span>
                {copiedConsultId ? (
                  <Check className="h-3 w-3 text-green-600" />
                ) : (
                  <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </button>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={consult.status === "finalized" ? "default" : "secondary"}>{consult.status || "Draft"}</Badge>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {format(new Date(consult.created_at), "MMM d, yyyy")}
          </span>
          {consult.status === "finalized" && canUnfinalizeConsult && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={isUnfinalizing}>
                  {isUnfinalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Unfinalize Case?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will revert the case to draft status, allowing you to make further edits. A new version will be
                    created and the action will be logged in the audit trail.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      if (!consultId) return;

                      setIsUnfinalizing(true);
                      try {
                        // Get session to ensure we have a valid access token
                        const { data: sessionData } = await supabase.auth.getSession();
                        if (!sessionData?.session?.access_token) {
                          toast.error("Session expired. Please log in again.");
                          return;
                        }

                        const { data, error } = await supabase.functions.invoke("unfinalize-consult", {
                          body: { consultId },
                          headers: {
                            Authorization: `Bearer ${sessionData.session.access_token}`,
                          },
                        });

                        if (error || !data?.success) {
                          console.error("Error unfinalizing:", error || data?.error);
                          toast.error(data?.error || "Failed to unfinalize consultation");
                          return;
                        }

                        toast.success("Consultation unfinalized successfully");
                        // Navigate to the appropriate editor based on currently displayed report
                        const editorPath =
                          selectedReportType === "wellness"
                            ? "wellness-editor"
                            : selectedReportType === "procedure"
                              ? "procedure-editor"
                              : "soap-editor";
                        navigate(`/${editorPath}/${consultId}`);
                      } catch (err) {
                        console.error("Error unfinalizing:", err);
                        toast.error("Failed to unfinalize consultation");
                      } finally {
                        setIsUnfinalizing(false);
                      }
                    }}
                  >
                    Continue
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </div>
  );

  // Scrollable main content - without header
  const scrollableMainContent = (
    <div className="space-y-2 sm:space-y-3 p-2 sm:p-4 lg:p-6 h-full overflow-y-auto">
      {/* Top Action Buttons Row - Desktop */}
      <div className="hidden sm:flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpenDialog("original")} className="gap-2">
          <Mic className="h-4 w-4" />
          Recording
          {consult.original_input && (
            <Badge variant="secondary" className="ml-1 text-xs">
              1
            </Badge>
          )}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => consult.discharge_summary && setOpenDialog("discharge")}
          disabled={!consult.discharge_summary && !isGeneratingDischarge}
          className="gap-2"
        >
          {isGeneratingDischarge ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileOutput className="h-4 w-4" />}
          Discharge
          {consult.discharge_summary && (
            <Badge variant="secondary" className="ml-1 text-xs">
              ✓
            </Badge>
          )}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => consult.client_education && setOpenDialog("education")}
          disabled={!consult.client_education && !isGeneratingEducation}
          className="gap-2"
        >
          {isGeneratingEducation ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
          Client Education
          {consult.client_education && (
            <Badge variant="secondary" className="ml-1 text-xs">
              ✓
            </Badge>
          )}
        </Button>

        <Button variant="outline" size="sm" onClick={() => setOpenDialog("caseNotes")} className="gap-2">
          <StickyNote className="h-4 w-4" />
          Case Notes
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowDiagnosticsDialog(true)}
          disabled={diagnostics.length === 0}
          className="gap-2"
        >
          <FlaskConical className="h-4 w-4" />
          Diagnostics
          {diagnostics.length > 0 && (
            <Badge variant="secondary" className="ml-1 text-xs">
              {diagnostics.length}
            </Badge>
          )}
        </Button>

        {/* Medicine Summary Button */}
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={extractedMedications.length === 0}
          onClick={() => setShowMedicineSelectorDialog(true)}
        >
          <Pill className="h-4 w-4" />
          Medicine Summary
          {extractedMedications.length > 0 && (
            <Badge variant="secondary" className="ml-1 text-xs">
              {extractedMedications.length}
            </Badge>
          )}
        </Button>
      </div>

      {/* Top Action Buttons Row - Mobile */}
      <Card className="sm:hidden">
        <CardContent className="p-3 flex justify-between items-center">
          {/* Report Dropdown - Left side */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 px-2">
                {selectedReportType === "soap"
                  ? "SOAP"
                  : selectedReportType === "wellness"
                    ? "Well"
                    : selectedReportType === "procedure"
                      ? "Proc"
                      : "Report"}
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="bg-background">
              <DropdownMenuItem disabled={!hasSOAP} onClick={() => hasSOAP && setSelectedReportType("soap")}>
                <FileText className="h-4 w-4 mr-2" />
                SOAP
                {hasSOAP && <span className="ml-auto text-xs text-primary">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!wellnessData}
                onClick={() => wellnessData && setSelectedReportType("wellness")}
              >
                <Stethoscope className="h-4 w-4 mr-2" />
                Wellness
                {wellnessData && <span className="ml-auto text-xs text-primary">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!procedureData}
                onClick={() => procedureData && setSelectedReportType("procedure")}
              >
                <ClipboardList className="h-4 w-4 mr-2" />
                Procedure
                {procedureData && <span className="ml-auto text-xs text-primary">✓</span>}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Option Buttons - Right side (individual buttons) */}
          <div className="flex gap-1">
            {/* Discharge Summary */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => consult.discharge_summary && setOpenDialog("discharge")}
              disabled={!consult.discharge_summary && !isGeneratingDischarge}
              className="gap-1 px-2"
            >
              {isGeneratingDischarge ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileOutput className="h-4 w-4" />
              )}
              <span className="text-xs">Discharge</span>
            </Button>

            {/* Case Notes */}
            <Button variant="outline" size="sm" onClick={() => setOpenDialog("caseNotes")} className="gap-1 px-2">
              <StickyNote className="h-4 w-4" />
              <span className="text-xs">Notes</span>
            </Button>

            {/* Diagnostics */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDiagnosticsDialog(true)}
              disabled={diagnostics.length === 0}
              className="gap-1 px-2 relative"
            >
              <FlaskConical className="h-4 w-4" />
              <span className="text-xs">Dx</span>
              {diagnostics.length > 0 && (
                <Badge
                  variant="secondary"
                  className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]"
                >
                  {diagnostics.length}
                </Badge>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report Type Badges Row - Desktop only */}
      <div className="hidden sm:flex flex-wrap gap-2 items-center">
        <span className="text-sm text-muted-foreground mr-1">Report:</span>
        <Button
          variant={selectedReportType === "soap" ? "default" : "outline"}
          size="sm"
          disabled={!hasSOAP}
          onClick={() => hasSOAP && setSelectedReportType("soap")}
          className={`gap-1.5 ${!hasSOAP ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <FileText className="h-3.5 w-3.5" />
          SOAP
          {hasSOAP && <span className="text-xs">✓</span>}
        </Button>
        <Button
          variant={selectedReportType === "wellness" ? "default" : "outline"}
          size="sm"
          disabled={!wellnessData}
          onClick={() => wellnessData && setSelectedReportType("wellness")}
          className={`gap-1.5 ${!wellnessData ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <Stethoscope className="h-3.5 w-3.5" />
          Wellness
          {wellnessData && <span className="text-xs">✓</span>}
        </Button>
        <Button
          variant={selectedReportType === "procedure" ? "default" : "outline"}
          size="sm"
          disabled={!procedureData}
          onClick={() => procedureData && setSelectedReportType("procedure")}
          className={`gap-1.5 ${!procedureData ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <ClipboardList className="h-3.5 w-3.5" />
          Procedure
          {procedureData && <span className="text-xs">✓</span>}
        </Button>
      </div>

      {/* Selected Report Expanded Inline */}
      {selectedReportType === "soap" && hasSOAP && (
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="p-3 pb-2 sm:p-6 sm:pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">SOAP Notes</CardTitle>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopyAll(soapCopyContent, "SOAP Notes")}
                className="gap-2"
              >
                <Copy className="h-4 w-4" />
                Copy All
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 p-3 pt-0 sm:p-6 sm:pt-0 sm:space-y-4">
            {consult.soap_s && isSectionEnabled("soap", "subjective") && (
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h4 className="font-semibold text-sm mb-1 text-primary">Subjective</h4>
                  <HighlightedContent content={stripMarkdown(consult.soap_s)} className="text-sm" />
                </div>
                <CopySectionButton text={stripAbnormalMarkers(consult.soap_s)} sectionTitle="Subjective" />
              </div>
            )}
            {consult.soap_o && isSectionEnabled("soap", "objective") && (
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h4 className="font-semibold text-sm mb-1 text-primary">Objective</h4>
                  <div className="text-sm space-y-0.5">
                    {formatContentSafely(consult.soap_o)
                      .split("\n")
                      .filter((line) => line.trim())
                      .map((line, idx) => {
                        const isHeading =
                          (line.endsWith(":") || line.match(/^(Vitals|Physical Examination):?$/i)) &&
                          !line.startsWith("•");
                        return (
                          <div
                            key={idx}
                            className={`leading-relaxed ${isHeading ? "font-semibold mt-2 first:mt-0" : "pl-2"}`}
                          >
                            <HighlightedContent content={line} />
                          </div>
                        );
                      })}
                  </div>
                </div>
                <CopySectionButton
                  text={stripAbnormalMarkers(formatContentSafely(consult.soap_o))}
                  sectionTitle="Objective"
                />
              </div>
            )}
            {consult.soap_a && isSectionEnabled("soap", "assessment") && (
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h4 className="font-semibold text-sm mb-1 text-primary">Assessment</h4>
                  <HighlightedContent content={stripMarkdown(consult.soap_a)} className="text-sm" />
                </div>
                <CopySectionButton text={stripAbnormalMarkers(consult.soap_a)} sectionTitle="Assessment" />
              </div>
            )}
            {consult.soap_p && isSectionEnabled("soap", "plan") && (
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h4 className="font-semibold text-sm mb-1 text-primary">Plan</h4>
                  <HighlightedContent content={stripMarkdown(consult.soap_p)} className="text-sm" />
                </div>
                <CopySectionButton text={stripAbnormalMarkers(consult.soap_p)} sectionTitle="Plan" />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedReportType === "wellness" && wellnessData && (
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Stethoscope className="h-5 w-5 text-green-500" />
                <CardTitle className="text-lg">Wellness Report</CardTitle>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopyAll(wellnessCopyContent, "Wellness Report")}
                className="gap-2"
              >
                <Copy className="h-4 w-4" />
                Copy All
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(wellnessData)
              .filter(([key, value]) => {
                // First check template
                if (!isSectionEnabled("wellness", key)) return false;
                // Hide empty diet and vaccines sections
                if (
                  (key === "dietNutrition" || key === "vaccinesAdministered") &&
                  (!value || (typeof value === "string" && !value.trim()))
                ) {
                  return false;
                }
                return true;
              })
              .map(([key, value]) => (
                <div key={key} className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm mb-1 text-green-600 capitalize">
                      {key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ")}
                    </h4>
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {typeof value === "string" ? stripMarkdown(value) : stripMarkdown(JSON.stringify(value, null, 2))}
                    </p>
                  </div>
                  <CopySectionButton
                    text={typeof value === "string" ? value : JSON.stringify(value, null, 2)}
                    sectionTitle={key
                      .replace(/([a-z])([A-Z])/g, "$1 $2")
                      .replace(/_/g, " ")
                      .replace(/\b\w/g, (c) => c.toUpperCase())}
                  />
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {selectedReportType === "procedure" && procedureData && (
        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-purple-500" />
                <CardTitle className="text-lg">Procedural Notes</CardTitle>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopyAll(procedureCopyContent, "Procedural Notes")}
                className="gap-2"
              >
                <Copy className="h-4 w-4" />
                Copy All
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(procedureData)
              .filter(([key]) => isSectionEnabled("procedure", key))
              .map(([key, value]) => (
                <div key={key} className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm mb-1 text-purple-600 capitalize">
                      {key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ")}
                    </h4>
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {typeof value === "string" ? stripMarkdown(value) : stripMarkdown(JSON.stringify(value, null, 2))}
                    </p>
                  </div>
                  <CopySectionButton
                    text={typeof value === "string" ? value : JSON.stringify(value, null, 2)}
                    sectionTitle={key
                      .replace(/([a-z])([A-Z])/g, "$1 $2")
                      .replace(/_/g, " ")
                      .replace(/\b\w/g, (c) => c.toUpperCase())}
                  />
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {!selectedReportType && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No report generated for this consultation yet.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );

  return (
    <div className="h-full bg-background overflow-hidden flex flex-col">
      {/* Header - Always at top, full width */}
      {headerContent}

      {/* Content area below header */}
      <div className="flex-1 min-h-0">
        {isMobile ? (
          // Mobile: Single column layout
          <div className="h-full overflow-y-auto">{scrollableMainContent}</div>
        ) : (
          // Desktop: Resizable two-panel layout
          <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
              {sidePanelContent}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={80}>{scrollableMainContent}</ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>

      {/* Original Input Dialog */}
      <SectionDetailDialog
        open={openDialog === "original"}
        onOpenChange={(open) => !open && setOpenDialog(null)}
        title="Recording / Submitted Form"
        icon={<Mic className="h-5 w-5" />}
        patient={patient}
        consultDate={consult.created_at}
        exportData={{ type: "original", content: consult.original_input }}
        clinic={clinicInfo}
        vet={vetInfo}
      >
        {consult.original_input ? (
          <div className="whitespace-pre-wrap text-sm bg-muted/50 p-4 rounded-lg">{consult.original_input}</div>
        ) : (
          <p className="text-muted-foreground text-sm">No original input recorded.</p>
        )}
      </SectionDetailDialog>

      {/* Case Notes Dialog */}
      <SectionDetailDialog
        open={openDialog === "caseNotes"}
        onOpenChange={(open) => !open && setOpenDialog(null)}
        title="Case Notes"
        icon={<StickyNote className="h-5 w-5" />}
        patient={patient}
        consultDate={consult.created_at}
      >
        {clinicId && (
          <CaseNotesSection
            key={caseNotesKey}
            consultId={consultId!}
            clinicId={clinicId}
            onNoteAdded={() => {}}
            embedded
          />
        )}
      </SectionDetailDialog>

      {/* Atlas AI Dialog */}
      <SectionDetailDialog
        open={openDialog === "drCatScan"}
        onOpenChange={(open) => !open && setOpenDialog(null)}
        title="Atlas - AI Assistant"
        icon={<AtlasEye size="xs" blink />}
        patient={patient}
        consultDate={consult.created_at}
      >
        <MinimizableAtlasChat
          transcription={consult.original_input}
          patientInfo={patient ? {
            patientId: consult.patient_id,
            name: patient.name || "",
            species: patient.species || "",
          } : null}
          consultId={consultId!}
          inline={true}
          readOnly={true}
        />
      </SectionDetailDialog>

      {/* Discharge Summary Dialog */}
      <SectionDetailDialog
        open={openDialog === "discharge"}
        onOpenChange={(open) => !open && setOpenDialog(null)}
        title="Visit/Discharge Summary"
        icon={<FileOutput className="h-5 w-5" />}
        patient={patient}
        consultDate={consult.created_at}
        exportData={{ type: "discharge", content: consult.discharge_summary }}
        copyAllContent={
          consult.discharge_summary
            ? `VISIT/DISCHARGE SUMMARY\n\n${stripMarkdown(consult.discharge_summary)}`
            : undefined
        }
        clinic={clinicInfo}
        vet={vetInfo}
        extraFooterContent={
          <Button variant="outline" onClick={() => setShowDraftEmailDialog(true)} disabled={!consult.discharge_summary}>
            <Mail className="h-4 w-4 mr-2" />
            Email Client
          </Button>
        }
      >
        {consult.discharge_summary && dischargeSections ? (
          <div className="space-y-6">
            {dischargeSections.summary && (
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h4 className="font-semibold text-sm mb-1 text-blue-600">Summary</h4>
                  <p className="text-sm whitespace-pre-wrap">{stripMarkdown(dischargeSections.summary)}</p>
                </div>
                <CopySectionButton text={dischargeSections.summary} sectionTitle="Summary" />
              </div>
            )}
            {dischargeSections.keyFindings && (
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h4 className="font-semibold text-sm mb-1 text-blue-600">Key Findings</h4>
                  <p className="text-sm whitespace-pre-wrap">{stripMarkdown(dischargeSections.keyFindings)}</p>
                </div>
                <CopySectionButton text={dischargeSections.keyFindings} sectionTitle="Key Findings" />
              </div>
            )}
            {dischargeSections.treatmentPlan && (
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h4 className="font-semibold text-sm mb-1 text-blue-600">Treatment Plan and Care Instructions</h4>
                  <p className="text-sm whitespace-pre-wrap">{stripMarkdown(dischargeSections.treatmentPlan)}</p>
                </div>
                <CopySectionButton text={dischargeSections.treatmentPlan} sectionTitle="Treatment Plan" />
              </div>
            )}
            {dischargeSections.signsToWatch && (
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h4 className="font-semibold text-sm mb-1 text-blue-600">Signs to Watch For</h4>
                  <p className="text-sm whitespace-pre-wrap">{stripMarkdown(dischargeSections.signsToWatch)}</p>
                </div>
                <CopySectionButton text={dischargeSections.signsToWatch} sectionTitle="Signs to Watch For" />
              </div>
            )}
            {dischargeSections.followUp && (
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h4 className="font-semibold text-sm mb-1 text-blue-600">Follow-Up Steps</h4>
                  <p className="text-sm whitespace-pre-wrap">{stripMarkdown(dischargeSections.followUp)}</p>
                </div>
                <CopySectionButton text={dischargeSections.followUp} sectionTitle="Follow-Up Steps" />
              </div>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No discharge summary generated.</p>
        )}
      </SectionDetailDialog>

      {/* Client Education Dialog */}
      <SectionDetailDialog
        open={openDialog === "education"}
        onOpenChange={(open) => !open && setOpenDialog(null)}
        title="Client Education"
        icon={<BookOpen className="h-5 w-5" />}
        patient={patient}
        consultDate={consult.created_at}
        copyAllContent={
          consult.client_education ? `CLIENT EDUCATION\n\n${stripMarkdown(consult.client_education)}` : undefined
        }
        exportData={
          educationSections
            ? {
                type: "education",
                content: {
                  whatIsCondition: educationSections.whatIsCondition,
                  causesRisk: educationSections.causesRisk,
                  understandingTreatment: educationSections.understandingTreatment,
                  recovery: educationSections.recovery,
                  homeCare: educationSections.homeCare,
                  prevention: educationSections.prevention,
                  whenToContact: educationSections.whenToContact,
                },
              }
            : undefined
        }
        clinic={clinicInfo}
        vet={vetInfo}
      >
        {consult.client_education && educationSections ? (
          <div className="space-y-6">
            {educationSections.whatIsCondition && (
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h4 className="font-semibold text-sm mb-1 text-blue-600">What Is This Condition?</h4>
                  <p className="text-sm whitespace-pre-wrap">{stripMarkdown(educationSections.whatIsCondition)}</p>
                </div>
                <CopySectionButton text={educationSections.whatIsCondition} sectionTitle="What Is This Condition" />
              </div>
            )}
            {educationSections.causesRisk && (
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h4 className="font-semibold text-sm mb-1 text-blue-600">Causes and Risk Factors</h4>
                  <p className="text-sm whitespace-pre-wrap">{stripMarkdown(educationSections.causesRisk)}</p>
                </div>
                <CopySectionButton text={educationSections.causesRisk} sectionTitle="Causes and Risk Factors" />
              </div>
            )}
            {educationSections.understandingTreatment && (
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h4 className="font-semibold text-sm mb-1 text-blue-600">Understanding the Treatment</h4>
                  <p className="text-sm whitespace-pre-wrap">
                    {stripMarkdown(educationSections.understandingTreatment)}
                  </p>
                </div>
                <CopySectionButton
                  text={educationSections.understandingTreatment}
                  sectionTitle="Understanding the Treatment"
                />
              </div>
            )}
            {educationSections.recovery && (
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h4 className="font-semibold text-sm mb-1 text-blue-600">What to Expect During Recovery</h4>
                  <p className="text-sm whitespace-pre-wrap">{stripMarkdown(educationSections.recovery)}</p>
                </div>
                <CopySectionButton text={educationSections.recovery} sectionTitle="What to Expect During Recovery" />
              </div>
            )}
            {educationSections.homeCare && (
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h4 className="font-semibold text-sm mb-1 text-blue-600">Home Care Tips</h4>
                  <p className="text-sm whitespace-pre-wrap">{stripMarkdown(educationSections.homeCare)}</p>
                </div>
                <CopySectionButton text={educationSections.homeCare} sectionTitle="Home Care Tips" />
              </div>
            )}
            {educationSections.prevention && (
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h4 className="font-semibold text-sm mb-1 text-blue-600">Prevention and Long-Term Care</h4>
                  <p className="text-sm whitespace-pre-wrap">{stripMarkdown(educationSections.prevention)}</p>
                </div>
                <CopySectionButton text={educationSections.prevention} sectionTitle="Prevention and Long-Term Care" />
              </div>
            )}
            {educationSections.whenToContact && (
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h4 className="font-semibold text-sm mb-1 text-blue-600">When to Contact Your Veterinarian</h4>
                  <p className="text-sm whitespace-pre-wrap">{stripMarkdown(educationSections.whenToContact)}</p>
                </div>
                <CopySectionButton
                  text={educationSections.whenToContact}
                  sectionTitle="When to Contact Your Veterinarian"
                />
              </div>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No client education generated.</p>
        )}
      </SectionDetailDialog>

      {/* Draft Email Dialog */}
      <DraftEmailDialog
        open={showDraftEmailDialog}
        onOpenChange={setShowDraftEmailDialog}
        patientName={patient?.name || "Patient"}
        dischargeSummary={consult.discharge_summary || ""}
        consultId={consultId!}
        hasClientEducation={!!consult.client_education}
        clientEducation={consult.client_education || undefined}
        medications={extractedMedications}
        patient={patient ? { name: patient.name, species: patient.species, breed: patient.breed } : null}
        clinic={clinicInfo}
        clinicEmail={clinicInfo?.clinic_email || undefined}
        doctorName={assignedUserName || vetInfo?.name}
        doctorPrefix={assignedUserPrefix || vetInfo?.name_prefix}
      />

      {/* Copy Fallback Dialog for iOS */}
      <CopyFallbackDialog
        open={showCopyFallback}
        onOpenChange={setShowCopyFallback}
        title="Copy Content"
        text={fallbackText}
      />

      {/* Diagnostics Dialog */}
      <Dialog open={showDiagnosticsDialog} onOpenChange={setShowDiagnosticsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5" />
              Diagnostics
              {diagnostics.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {diagnostics.length} file{diagnostics.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>Diagnostic files uploaded during this consultation</DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <DiagnosticsSection diagnostics={diagnostics} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Medication Profile Dialog */}
      <MedicationProfileDialog
        open={showMedicationDialog}
        onOpenChange={setShowMedicationDialog}
        drugName={selectedMedication}
        profile={medicationProfile}
        isLoading={isGeneratingMedProfile}
        clinic={clinicInfo}
        patient={
          patient
            ? {
                name: patient.name,
                species: patient.species,
                breed: patient.breed,
              }
            : null
        }
        onCopyFallback={(text) => {
          setFallbackText(text);
          setShowCopyFallback(true);
        }}
      />

      {/* Medicine Selector Dialog */}
      <MedicineSelectorDialog
        open={showMedicineSelectorDialog}
        onOpenChange={setShowMedicineSelectorDialog}
        medications={extractedMedications}
        patient={patient}
        clinic={clinicInfo}
      />

      {/* Fixed Bottom Action Bar - Mobile Only */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border">
        <div className="flex items-center justify-around px-2 py-2">
          {/* Dashboard */}
          <button onClick={() => navigate("/dashboard")} className="flex flex-col items-center gap-0.5 py-2 px-3">
            <Home className="h-5 w-5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Dashboard</span>
          </button>

          {/* Patient Details */}
          <button onClick={() => setShowSidePanel(true)} className="flex flex-col items-center gap-0.5 py-2 px-3">
            <PawPrint className="h-5 w-5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Patient</span>
          </button>

          {/* Recording - Center, Elevated */}
          <button onClick={() => setOpenDialog("original")} className="flex flex-col items-center gap-0.5">
            <div className="h-14 w-14 rounded-full bg-[#0D9488] shadow-lg flex items-center justify-center -mt-4">
              <Mic className="h-6 w-6 text-white" />
            </div>
            <span className="text-[10px] text-[#0D9488] font-semibold">Recording</span>
          </button>

          {/* Client Education */}
          <button
            onClick={() => consult?.client_education && setOpenDialog("education")}
            disabled={!consult?.client_education && !isGeneratingEducation}
            className="flex flex-col items-center gap-0.5 py-2 px-3 disabled:opacity-50"
          >
            <BookOpen className="h-5 w-5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Education</span>
          </button>

          {/* Medication Summary */}
          <button
            onClick={() => setShowMedicineSelectorDialog(true)}
            disabled={extractedMedications.length === 0}
            className="flex flex-col items-center gap-0.5 py-2 px-3 disabled:opacity-50"
          >
            <Pill className="h-5 w-5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Medicine</span>
          </button>
        </div>
        {/* Safe area spacer */}
        <div style={{ height: "var(--safe-area-bottom)" }} />
      </div>

      {/* Floating CatScan Button - Bottom Right */}
      <button
        onClick={() => setOpenDialog("drCatScan")}
        className="fixed right-6 z-50 group floating-above-nav lg:bottom-6"
      >
        <div className="relative h-14 w-14 rounded-full bg-accent shadow-lg flex items-center justify-center overflow-hidden transition-transform hover:scale-110 ring-2 ring-accent/20">
          <AtlasEye size="sm" blink glowIntensity="low" />
        </div>
        {messageCount > 0 && (
          <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium shadow-sm">
            {messageCount}
          </div>
        )}
      </button>
    </div>
  );
}
