import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, Save, Download, Printer, Loader2, Copy, Check, Menu, Share2 } from 'lucide-react';
import { EditorSkeleton } from '@/components/consult/EditorSkeleton';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { copyToClipboard, isIOS } from '@/utils/clipboard';
import { CopyFallbackDialog } from '@/components/ui/CopyFallbackDialog';
import { stripMarkdownCompact } from '@/utils/stripMarkdown';
import { RegenerateDialog } from '@/components/consult/RegenerateDialog';
import { generateProfessionalPDF, PatientInfoPDF } from '@/utils/pdfExport';
import { getUserTimezone } from '@/lib/timezone';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { HighlightedContent } from '@/components/soap/HighlightedContent';
import { CopySectionButton } from '@/components/consult/CopySectionButton';
import { RegenerateSectionButton } from '@/components/consult/RegenerateSectionButton';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { EditorSidePanel } from '@/components/consult/EditorSidePanel';
import { ActiveRecordingDialog } from '@/components/consult/ActiveRecordingDialog';
import { UploadDiagnosticsDialog } from '@/components/consult/UploadDiagnosticsDialog';
import { ViewInputDialog } from '@/components/consult/ViewInputDialog';
import { MinimizableAtlasChat } from '@/components/chat/MinimizableAtlasChat';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useUserTemplates } from '@/hooks/use-user-templates';
import { EditorMobileBottomNav } from '@/components/consult/EditorMobileBottomNav';
import { useNativeDocument } from '@/hooks/use-native-document';
import { useTranscriptionSegments } from '@/hooks/use-transcription-segments';
import { TranscriptionSegment } from '@/types/transcription';
interface WellnessData {
  patientInformation: string;
  vitalsWeightManagement: string;
  physicalExamination: string;
  assessment: string;
  vaccinesAdministered: string;
  preventiveCareStatus: string;
  dietNutrition: string;
  ownerDiscussion: string;
  recommendations: string;
  clientEducation: string;
}

const sectionLabels: Record<keyof WellnessData, string> = {
  patientInformation: 'Patient Information',
  vitalsWeightManagement: 'Vitals & Weight Management',
  physicalExamination: 'Physical Examination',
  assessment: 'Assessment',
  vaccinesAdministered: 'Vaccines Administered',
  preventiveCareStatus: 'Preventive Care Status',
  dietNutrition: 'Diet & Nutrition',
  ownerDiscussion: 'Owner Discussion',
  recommendations: 'Recommendations',
  clientEducation: 'Client Education'
};
interface WellnessSectionProps {
  title: string;
  content: string;
  onChange: (value: string) => void;
  onRegenerate: (instruction: string) => Promise<void>;
  isGenerating: boolean;
  isRegenerating: boolean;
  showDivider: boolean;
}
function WellnessSection({
  title,
  content,
  onChange,
  onRegenerate,
  isGenerating,
  isRegenerating,
  showDivider
}: WellnessSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [isEditing, content]);
  if (isGenerating || isRegenerating) {
    return <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base md:text-lg font-semibold text-foreground">{title}</h3>
        </div>
        <div className="space-y-2 min-h-[80px]">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-5/6" />
        </div>
        {showDivider && <Separator className="mt-6" />}
      </div>;
  }
  return <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base md:text-lg font-semibold text-foreground">{title}</h3>
        <div className="flex items-center gap-1">
          <RegenerateSectionButton sectionTitle={title} onRegenerate={onRegenerate} disabled={isGenerating} />
          <CopySectionButton text={content} sectionTitle={title} />
        </div>
      </div>
      {isEditing ? <Textarea ref={textareaRef} value={content} onChange={e => {
      onChange(e.target.value);
      e.target.style.height = 'auto';
      e.target.style.height = `${e.target.scrollHeight}px`;
    }} onBlur={() => setIsEditing(false)} className="resize-none border-none bg-transparent p-0 focus-visible:ring-0 min-h-[60px]" /> : <div onClick={() => setIsEditing(true)} className="cursor-text min-h-[60px] text-sm md:text-base whitespace-pre-wrap">
          {content ? <HighlightedContent content={content} /> : <span className="text-muted-foreground">Click to enter {title?.toLowerCase() || 'content'}...</span>}
        </div>}
      {showDivider && <Separator className="mt-6" />}
    </div>;
}
export default function WellnessEditor() {
  const {
    consultId
  } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    toast
  } = useToast();
  const isMobile = useIsMobile();
  const { isNative, shareFromBlob, printFromBlob, downloadFromBlob } = useNativeDocument();
  const { getActiveTemplate, isLoading: templatesLoading } = useUserTemplates();
  const { segments: transcriptionSegments, setSegments: setTranscriptionSegments, saveSegments, loadSegments, appendSegments } = useTranscriptionSegments();
  const activeTemplate = getActiveTemplate('wellness');
  const enabledSections = useMemo(() => {
    if (!activeTemplate) {
      // Default: all sections enabled
      return Object.keys(sectionLabels) as Array<keyof WellnessData>;
    }
    // Filter enabled sections and ensure they exist in sectionLabels
    return activeTemplate.sections
      .filter(s => s.enabled && s.id in sectionLabels)
      .map(s => s.id as keyof WellnessData);
  }, [activeTemplate]);
  
  const [wellnessData, setWellnessData] = useState<WellnessData>({
    patientInformation: '',
    vitalsWeightManagement: '',
    physicalExamination: '',
    assessment: '',
    vaccinesAdministered: '',
    preventiveCareStatus: '',
    dietNutrition: '',
    ownerDiscussion: '',
    recommendations: '',
    clientEducation: ''
  });
  const [patientInfo, setPatientInfo] = useState<{
    patientId: string;
    id?: string;
    name: string;
    species: string;
    breed?: string;
    sex?: string;
    age?: string;
    dateOfBirth?: string;
    weightKg?: number;
    weightLb?: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [regeneratingSection, setRegeneratingSection] = useState<keyof WellnessData | null>(null);
  const [copied, setCopied] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [fallbackText, setFallbackText] = useState('');
  const [copiedConsultId, setCopiedConsultId] = useState(false);
  
  const handleCopyConsultId = async () => {
    if (!consultId) return;
    try {
      await navigator.clipboard.writeText(consultId);
      setCopiedConsultId(true);
      toast({ title: "Copied!", description: "Consult ID copied to clipboard" });
      setTimeout(() => setCopiedConsultId(false), 2000);
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [originalInput, setOriginalInput] = useState<string>('');
  const [transcription, setTranscription] = useState<string>('');
  const [transcriptionVersion, setTranscriptionVersion] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showRecordingDialog, setShowRecordingDialog] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [uploadedFilesCount, setUploadedFilesCount] = useState(0);
  const [clinicId, setClinicId] = useState<string>('');
  const [inputMode, setInputMode] = useState<'recording' | 'typed' | 'continue'>('recording');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const handleCopyAll = async () => {
    const sections = enabledSections.map(key => ({
      label: sectionLabels[key].toUpperCase(),
      content: wellnessData[key]
    }));
    const fullText = sections.map(s => `${s.label}:\n${stripMarkdownCompact(s.content || 'N/A')}`).join('\n');
    if (isIOS()) {
      setFallbackText(fullText);
      setShowFallback(true);
      return;
    }
    const success = await copyToClipboard(fullText);
    if (success) {
      setCopied(true);
      toast({
        title: "All sections copied"
      });
      setTimeout(() => setCopied(false), 2000);
    } else {
      setFallbackText(fullText);
      setShowFallback(true);
    }
  };
  const autoSaveDraft = async (data: WellnessData) => {
    if (!consultId) return;
    try {
      // Get original input from scoped sessionStorage
      const transcriptionData = sessionStorage.getItem(`pendingTranscription_${consultId}`);
      const formData = sessionStorage.getItem(`pendingFormData_${consultId}`);
      const originalInputData = formData || transcriptionData || null;
      const {
        data: existingConsult
      } = await supabase.from('consults').select('original_input, case_notes').eq('id', consultId).single();
      let mergedCaseNotes: Record<string, unknown> = {};
      if (existingConsult?.case_notes) {
        try {
          mergedCaseNotes = JSON.parse(existingConsult.case_notes);
        } catch {}
      }
      mergedCaseNotes.wellness = data;
      const updatePayload: Record<string, unknown> = {
        case_notes: JSON.stringify(mergedCaseNotes)
      };
      if (!existingConsult?.original_input && originalInputData) {
        updatePayload.original_input = originalInputData;
      }
      await supabase.from('consults').update(updatePayload).eq('id', consultId);
    } catch (error) {
      console.error('Auto-save draft error:', error);
    }
  };
  useEffect(() => {
    if (consultId) loadConsultData();
  }, [consultId]);
  const loadConsultData = async () => {
    if (!consultId) return;
    setIsLoading(true);
    try {
      // LAYER 3: Clear stale data from other consults on entry
      const scopedKeys = ['pendingTranscription', 'pendingFormData', 'generated_soap_data', 'generated_wellness_data', 'generated_procedure_data', 'uploadedDiagnosticsCount', 'inputMode'];
      scopedKeys.forEach(key => sessionStorage.removeItem(key)); // Remove legacy unscoped keys
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (key && scopedKeys.some(prefix => key.startsWith(`${prefix}_`) && !key.endsWith(`_${consultId}`))) {
          sessionStorage.removeItem(key);
        }
      }

      // Patient enrichment is handled at entry points (PostRecordingOptions, ConsultModeSelectionDialog)
      // This page just fetches the already-enriched data for faster load times

      // LAYER 4: Check for pre-generated wellness data with consultId validation
      const preGeneratedData = sessionStorage.getItem(`generated_wellness_data_${consultId}`);
      let hasPreGeneratedData = false;
      if (preGeneratedData) {
        try {
          const parsed = JSON.parse(preGeneratedData);
          // Validate consultId matches
          if (parsed?.consultId === consultId && parsed?.wellness) {
            const newData: WellnessData = {
              patientInformation: parsed.wellness.patientInformation || parsed.wellness.visitHeader || '',
              vitalsWeightManagement: parsed.wellness.vitalsWeightManagement || '',
              physicalExamination: parsed.wellness.physicalExamination || '',
              assessment: parsed.wellness.assessment || '',
              vaccinesAdministered: parsed.wellness.vaccinesAdministered || '',
              preventiveCareStatus: parsed.wellness.preventiveCareStatus || '',
              dietNutrition: parsed.wellness.dietNutrition || '',
              ownerDiscussion: parsed.wellness.ownerDiscussion || '',
              recommendations: parsed.wellness.recommendations || '',
              clientEducation: parsed.wellness.clientEducation || ''
            };
            setWellnessData(newData);
            
            // Only mark as having data if there's actual non-empty content
            const hasActualContent = Object.values(newData).some(v => v && v.trim().length > 0);
            if (hasActualContent) {
              hasPreGeneratedData = true;
              await autoSaveDraft(newData);
            }
          } else if (parsed?.consultId && parsed.consultId !== consultId) {
            console.warn(`Pre-generated wellness data consultId mismatch: expected ${consultId}, got ${parsed.consultId}`);
          }
        } catch (e) {
          console.error('Error parsing pre-generated wellness data:', e);
        }
        // Always remove after attempting to use
        sessionStorage.removeItem(`generated_wellness_data_${consultId}`);
      }
      const {
        data: consult
      } = await supabase.from('consults').select('id, clinic_id, original_input, case_notes, patient:patients (id, name, species, breed, sex, age, date_of_birth, identifiers, weight_kg, weight_lb)').eq('id', consultId).single();
      if (consult?.clinic_id) setClinicId(consult.clinic_id);
      
      // LAYER 2: Prioritize database over sessionStorage for original_input
      if (consult?.original_input) {
        setOriginalInput(consult.original_input);
        setTranscription(consult.original_input);
      } else {
        // Fallback to scoped sessionStorage only if database is empty
        const t = sessionStorage.getItem(`pendingTranscription_${consultId}`);
        const f = sessionStorage.getItem(`pendingFormData_${consultId}`);
        const input = f || t || '';
        setOriginalInput(input);
        setTranscription(input);
      }
      
      // Get uploaded files count (scoped)
      const uploadCount = sessionStorage.getItem(`uploadedDiagnosticsCount_${consultId}`);
      if (uploadCount) setUploadedFilesCount(parseInt(uploadCount, 10));
      
      // Get input mode (scoped)
      const mode = sessionStorage.getItem(`inputMode_${consultId}`) as 'recording' | 'typed' | 'continue' | null;
      if (mode) setInputMode(mode);
      
      // Load transcription segments for speaker diarization
      await loadSegments(consultId);
      if (consult?.patient) {
        const patient = consult.patient as any;
        const calculateAge = (dob?: string) => {
          if (!dob) return null;
          const birth = new Date(dob);
          const today = new Date();
          const years = today.getFullYear() - birth.getFullYear();
          if (years === 0) {
            const months = today.getMonth() - birth.getMonth();
            return `${Math.max(0, months)} month${months !== 1 ? 's' : ''}`;
          }
          return `${years} year${years !== 1 ? 's' : ''}`;
        };
        setPatientInfo({
          patientId: patient.identifiers?.patient_id || patient.id.slice(0, 8),
          id: patient.id,
          name: patient.name,
          species: patient.species,
          breed: patient.breed,
          sex: patient.sex,
          age: patient.age || calculateAge(patient.date_of_birth),
          dateOfBirth: patient.date_of_birth,
          weightKg: patient.weight_kg,
          weightLb: patient.weight_lb
        });
        
        // Fallback enrichment for incomplete patients
        const isIncomplete = !patient?.name || patient.name === 'New Patient' || 
          !patient?.species || patient.species === 'Unknown';
        
        if (isIncomplete && patient?.id) {
          console.log('Triggering fallback enrichment for incomplete patient');
          supabase.functions.invoke('enrich-patient-details', {
            body: { patientId: patient.id }
          }).then(async () => {
            const { data: refreshedPatient } = await supabase
              .from('patients')
              .select('id, name, species, breed, sex, age, date_of_birth, identifiers, weight_kg, weight_lb')
              .eq('id', patient.id)
              .single();
            if (refreshedPatient) {
              const ids = refreshedPatient.identifiers as Record<string, string> | null;
              setPatientInfo({
                patientId: ids?.patient_id || refreshedPatient.id.slice(0, 8),
                id: refreshedPatient.id,
                name: refreshedPatient.name,
                species: refreshedPatient.species,
                breed: refreshedPatient.breed,
                sex: refreshedPatient.sex,
                age: refreshedPatient.age || calculateAge(refreshedPatient.date_of_birth),
                dateOfBirth: refreshedPatient.date_of_birth,
                weightKg: refreshedPatient.weight_kg,
                weightLb: refreshedPatient.weight_lb
              });
            }
          }).catch(err => console.log('Fallback enrichment error:', err));
        }
      }
      if (!hasPreGeneratedData && consult?.case_notes) {
        try {
          const caseNotes = typeof consult.case_notes === 'string' ? JSON.parse(consult.case_notes) : consult.case_notes;
          if (caseNotes?.wellness) {
            const saved = caseNotes.wellness;
            const newData: WellnessData = {
              patientInformation: saved.patientInformation || saved.visitHeader || '',
              vitalsWeightManagement: saved.vitalsWeightManagement || '',
              physicalExamination: saved.physicalExamination || '',
              assessment: saved.assessment || '',
              vaccinesAdministered: saved.vaccinesAdministered || '',
              preventiveCareStatus: saved.preventiveCareStatus || '',
              dietNutrition: saved.dietNutrition || '',
              ownerDiscussion: saved.ownerDiscussion || '',
              recommendations: saved.recommendations || '',
              clientEducation: saved.clientEducation || ''
            };
            setWellnessData(newData);
            // Only mark as having data if there's actual non-empty content
            const hasActualContent = Object.values(newData).some(v => v && v.trim().length > 0);
            if (hasActualContent) {
              hasPreGeneratedData = true;
            }
          }
        } catch (e) {
          console.error('Error parsing case_notes:', e);
        }
      }
      // Check for forced regeneration via URL param (when switching from another editor after input change)
      const shouldRegenerate = searchParams.get('regenerate') === 'true';
      if (shouldRegenerate) {
        // Clear the param from URL
        searchParams.delete('regenerate');
        setSearchParams(searchParams, { replace: true });
        
        toast({
          title: "Input was updated",
          description: "Regenerating wellness report with new data..."
        });
        await generateWellness();
      } else if (!hasPreGeneratedData) await generateWellness();
    } catch (error) {
      console.error('Error loading consult:', error);
      toast({
        title: "Error",
        description: "Failed to load consultation data.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };
  const generateWellness = async (regenerationInstruction?: string) => {
    setIsGenerating(true);
    try {
      let content = '';
      
      // LAYER 2: Prioritize database over sessionStorage (canonical source)
      if (consultId) {
        const {
          data: dbConsult
        } = await supabase.from('consults').select('original_input').eq('id', consultId).single();
        if (dbConsult?.original_input) {
          content = dbConsult.original_input;
        }
      }
      
      // Fallback to scoped sessionStorage only if database is empty
      if (!content && consultId) {
        const f = sessionStorage.getItem(`pendingFormData_${consultId}`);
        const t = sessionStorage.getItem(`pendingTranscription_${consultId}`);
        content = f || t || '';
      }

      if (!content) {
        toast({
          title: "Insufficient Information",
          description: "Please provide more details about the consultation before generating a report.",
          variant: "destructive"
        });
        if (consultId) {
          navigate(`/post-recording/${consultId}`);
        } else {
          navigate('/consults');
        }
        return;
      }
      const {
        data: consult
      } = await supabase.from('consults').select('patient:patients (name, species, breed, date_of_birth)').eq('id', consultId).single();
      const {
        data,
        error
      } = await supabase.functions.invoke('generate-wellness', {
        body: {
          consultId,
          transcription: content,
          patientInfo: consult?.patient,
          regenerationInstruction,
          timezone: getUserTimezone(),
          templateSections: enabledSections
        }
      });
      if (error) throw error;

      // Check for AI-returned insufficient data error
      if (data?.error === 'INSUFFICIENT_CLINICAL_DATA' || data?.wellness?.error === 'INSUFFICIENT_CLINICAL_DATA') {
        toast({
          title: "Insufficient Clinical Data",
          description: data?.message || data?.wellness?.message || "The provided input does not contain enough clinical information to generate accurate wellness notes. Please provide more details.",
          variant: "destructive"
        });
        setIsGenerating(false);
        navigate(-1);
        return;
      }
      if (data?.wellness) {
        const newData: WellnessData = {
          patientInformation: data.wellness.patientInformation || data.wellness.visitHeader || '',
          vitalsWeightManagement: data.wellness.vitalsWeightManagement || '',
          physicalExamination: data.wellness.physicalExamination || '',
          assessment: data.wellness.assessment || '',
          vaccinesAdministered: data.wellness.vaccinesAdministered || '',
          preventiveCareStatus: data.wellness.preventiveCareStatus || '',
          dietNutrition: data.wellness.dietNutrition || '',
          ownerDiscussion: data.wellness.ownerDiscussion || '',
          recommendations: data.wellness.recommendations || '',
          clientEducation: data.wellness.clientEducation || ''
        };
        setWellnessData(newData);
        await autoSaveDraft(newData);
        setTimeout(() => setIsGenerating(false), 100);
      } else {
        setIsGenerating(false);
      }
    } catch (error: any) {
      console.error('Wellness generation error:', error);
      toast({
        title: "Generation Failed",
        description: "Unable to generate wellness report.",
        variant: "destructive"
      });
      setIsGenerating(false);
    }
  };
  const handleRegenerate = () => setShowRegenerateDialog(true);
  const handleRegenerateWithInstruction = async (instruction: string) => {
    setShowRegenerateDialog(false);
    
    // Get the current latest report ID before regenerating
    let previousReportId: string | undefined;
    try {
      const { data: latestReport } = await supabase
        .from('reports_generated')
        .select('id')
        .eq('consult_id', consultId)
        .eq('report_type', 'wellness')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      previousReportId = latestReport?.id;
    } catch (e) {
      console.log('[WELLNESS] No previous report found for versioning');
    }
    
    await generateWellness(instruction);
    
    // Log the regeneration with version tracking
    if (clinicId && consultId) {
      const { logReportGenerated } = await import('@/lib/auditLogger');
      await logReportGenerated({
        clinicId,
        consultId,
        reportType: 'wellness',
        patientId: patientInfo?.id,
        patientName: patientInfo?.name,
        inputMode,
        transcriptionLength: transcription?.length || 0,
        uploadedFilesCount,
        regenerationReason: instruction,
        regeneratedFrom: previousReportId,
        wellnessData: wellnessData as unknown as Record<string, string>,
      });
    }
    
    toast({
      title: "Wellness Report Regenerated"
    });
  };
  const handleSectionChange = (section: keyof WellnessData, value: string) => setWellnessData(prev => ({
    ...prev,
    [section]: value
  }));
  const handleSectionRegenerate = async (section: keyof WellnessData, instruction: string) => {
    setRegeneratingSection(section);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke('regenerate-section', {
        body: {
          sectionContent: wellnessData[section],
          sectionTitle: sectionLabels[section],
          instruction,
          originalInput,
          reportType: 'wellness'
        }
      });
      if (error) throw error;
      if (data?.regeneratedContent) {
        handleSectionChange(section, data.regeneratedContent);
        toast({
          title: `${sectionLabels[section]} updated`
        });
      }
    } catch (error: any) {
      toast({
        title: "Regeneration Failed",
        description: error.message || "Unable to regenerate section.",
        variant: "destructive"
      });
    } finally {
      setRegeneratingSection(null);
    }
  };
  const handleSave = async () => {
    if (!consultId) return;
    setIsSaving(true);
    try {
      const t = sessionStorage.getItem('pendingTranscription');
      const f = sessionStorage.getItem('pendingFormData');
      const originalInputData = f || t || null;
      const {
        data: existingConsult
      } = await supabase.from('consults').select('case_notes, original_input').eq('id', consultId).single();
      let mergedCaseNotes: Record<string, unknown> = {};
      if (existingConsult?.case_notes) {
        try {
          mergedCaseNotes = JSON.parse(existingConsult.case_notes);
        } catch {}
      }
      mergedCaseNotes.wellness = wellnessData;
      const updatePayload: Record<string, unknown> = {
        case_notes: JSON.stringify(mergedCaseNotes),
        visit_type: 'wellness',
        status: 'finalized',
        finalized_at: new Date().toISOString()
      };
      if (!existingConsult?.original_input && originalInputData) updatePayload.original_input = originalInputData;
      const {
        error
      } = await supabase.from('consults').update(updatePayload).eq('id', consultId);
      if (error) throw error;

      // Update consult_history with client-side metadata for compliance
      const { updateConsultHistoryMetadata } = await import('@/lib/auditLogger');
      await updateConsultHistoryMetadata(consultId);
      sessionStorage.removeItem('pendingRecording');
      sessionStorage.removeItem('pendingRecordingDuration');
      sessionStorage.removeItem('pendingTranscription');
      sessionStorage.removeItem('pendingFormData');
      toast({
        title: "Saved Successfully"
      });
      navigate(`/case-summary/${consultId}`);
    } catch (error: any) {
      toast({
        title: "Save Failed",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };
  const handleDownload = async () => {
    const patientPDF: PatientInfoPDF | null = patientInfo ? {
      name: patientInfo.name,
      species: patientInfo.species,
      patientId: patientInfo.patientId
    } : null;
    const sections = enabledSections.map(key => ({
      heading: sectionLabels[key],
      content: wellnessData[key] || null
    }));
    const doc = generateProfessionalPDF('Wellness Report', null, null, patientPDF, new Date().toISOString(), sections);
    const fileName = `Wellness-${patientInfo?.patientId || consultId?.slice(0, 8)}-${new Date().toISOString().split('T')[0]}.pdf`;
    
    if (isNative) {
      // Native: Use share sheet for sharing/saving
      const blob = doc.output('blob');
      await shareFromBlob(blob, fileName);
    } else {
      // Web: Direct download
      doc.save(fileName);
      toast({
        title: "Download Started"
      });
    }
  };
  
  const handleShare = async () => {
    const patientPDF: PatientInfoPDF | null = patientInfo ? {
      name: patientInfo.name,
      species: patientInfo.species,
      patientId: patientInfo.patientId
    } : null;
    const sections = enabledSections.map(key => ({
      heading: sectionLabels[key],
      content: wellnessData[key] || null
    }));
    const doc = generateProfessionalPDF('Wellness Report', null, null, patientPDF, new Date().toISOString(), sections);
    const blob = doc.output('blob');
    const fileName = `Wellness-${patientInfo?.patientId || consultId?.slice(0, 8)}-${new Date().toISOString().split('T')[0]}.pdf`;
    await shareFromBlob(blob, fileName);
  };
  
  const handlePrint = async () => {
    if (isNative) {
      // Native: Generate PDF and print via AirPrint/native print service
      const patientPDF: PatientInfoPDF | null = patientInfo ? {
        name: patientInfo.name,
        species: patientInfo.species,
        patientId: patientInfo.patientId
      } : null;
      const sections = enabledSections.map(key => ({
        heading: sectionLabels[key],
        content: wellnessData[key] || null
      }));
      const doc = generateProfessionalPDF('Wellness Report', null, null, patientPDF, new Date().toISOString(), sections);
      const blob = doc.output('blob');
      await printFromBlob(blob);
    } else {
      // Web: Browser print
      window.print();
    }
  };
  const handleRecordingComplete = async (audioBlob: Blob) => {
    try {
      const existingTranscription = transcription || '';
      setIsTranscribing(true);
      setShowRecordingDialog(false);
      const base64Audio = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });
      const {
        data,
        error
      } = await supabase.functions.invoke('transcribe-audio', {
        body: {
          audio: base64Audio
        }
      });
      if (error) throw error;
      if (data?.text) {
        const newTranscription = existingTranscription ? `${existingTranscription}\n\n--- CONTINUED RECORDING ---\n${data.text}` : data.text;
        setTranscription(newTranscription);
        setOriginalInput(newTranscription);
        sessionStorage.setItem('pendingTranscription', newTranscription);
        
        // Handle speaker diarization segments
        if (data.segments?.length > 0) {
          console.log(`[Wellness] Received ${data.segments.length} speaker segments`);
          appendSegments(data.segments);
          
          // Save segments to database
          if (consultId && clinicId) {
            const allSegments = [...transcriptionSegments, ...data.segments];
            await saveSegments(consultId, clinicId, allSegments);
          }
        }
        
        // Mark input as modified for cross-report regeneration
        sessionStorage.setItem('inputModified', 'true');
        
        if (consultId) await supabase.from('consults').update({
          original_input: newTranscription
        }).eq('id', consultId);
        setTranscriptionVersion(prev => prev + 1);
        toast({
          title: "Transcription complete",
          description: "Regenerating wellness report..."
        });
        await generateWellness();
      }
    } catch (error) {
      console.error('Transcription error:', error);
      toast({
        title: "Transcription Failed",
        variant: "destructive"
      });
    } finally {
      setIsTranscribing(false);
    }
  };
  const handleAnalysisComplete = async (analysis: any) => {
    let diagnosticSummary = '';
    if (analysis.labPanel?.parsed?.length > 0) {
      diagnosticSummary = 'Lab Results:\n' + analysis.labPanel.parsed.map((lab: any) => `• ${lab.analyte}: ${lab.value} ${lab.unit}${lab.flag && lab.flag.toLowerCase() !== 'normal' ? ` [${lab.flag.toUpperCase()}]` : ''}`).join('\n');
    } else if (analysis.imaging?.findings?.length > 0) {
      diagnosticSummary = `${(analysis.document_type || 'Imaging').charAt(0).toUpperCase() + (analysis.document_type || 'Imaging').slice(1)} Findings:\n` + analysis.imaging.findings.map((f: string) => `• ${f}`).join('\n');
    }
    if (!diagnosticSummary) return;

    // Get transcription from multiple sources - SAFETY NET: fetch from DB if empty
    let currentTranscription = transcription || '';
    if (!currentTranscription && consultId) {
      console.warn('[WellnessEditor] Local transcription empty, fetching from database...');
      const {
        data: consult
      } = await supabase.from('consults').select('original_input').eq('id', consultId).single();
      if (consult?.original_input) {
        currentTranscription = consult.original_input;
        setTranscription(currentTranscription);
        setOriginalInput(currentTranscription);
        sessionStorage.setItem('pendingTranscription', currentTranscription);
      }
    }
    if (!currentTranscription) {
      toast({
        title: "Warning",
        description: "No recording found. Diagnostic findings will be saved without recording context.",
        variant: "destructive"
      });
    }
    const enrichedTranscription = currentTranscription ? `${currentTranscription}\n\n**Diagnostics Findings**\n${diagnosticSummary}` : `**Diagnostics Findings**\n${diagnosticSummary}`;
    setTranscription(enrichedTranscription);
    setOriginalInput(enrichedTranscription);
    sessionStorage.setItem('pendingTranscription', enrichedTranscription);
    
    // Mark input as modified for cross-report regeneration
    sessionStorage.setItem('inputModified', 'true');
    
    if (consultId) await supabase.from('consults').update({
      original_input: enrichedTranscription
    }).eq('id', consultId);
    setTranscriptionVersion(prev => prev + 1);
    toast({
      title: "Diagnostic findings added",
      description: "Regenerating wellness report..."
    });
    await generateWellness();
  };
  const handleViewInputSave = async (updatedContent: string, updatedSegments?: TranscriptionSegment[]) => {
    setTranscription(updatedContent);
    setOriginalInput(updatedContent);
    sessionStorage.setItem('pendingTranscription', updatedContent);
    
    // Handle segment updates
    if (updatedSegments) {
      setTranscriptionSegments(updatedSegments);
      if (consultId && clinicId) {
        await saveSegments(consultId, clinicId, updatedSegments);
      }
    }
    
    // Mark input as modified for cross-report regeneration
    sessionStorage.setItem('inputModified', 'true');
    
    if (consultId) await supabase.from('consults').update({
      original_input: updatedContent
    }).eq('id', consultId);
    setTranscriptionVersion(prev => prev + 1);
    toast({
      title: "Input updated",
      description: "Regenerating wellness report..."
    });
    await generateWellness();
  };
  if (isLoading || templatesLoading) return <EditorSkeleton />;
  const sidePanelContent = <EditorSidePanel consultId={consultId || ''} patientInfo={patientInfo} currentReportType="wellness" uploadedFilesCount={uploadedFilesCount} isTranscribing={isTranscribing} onContinueRecording={() => setShowRecordingDialog(true)} onUploadDiagnostics={() => setShowUploadDialog(true)} onViewInput={() => setShowViewDialog(true)} clinicId={clinicId} onPatientUpdated={loadConsultData} />;
  const reportContent = <div className="p-4">
      <Card className="border-l-4 border-l-primary">
        <CardContent className="p-4 md:p-6">
          <div className="space-y-6">
            {enabledSections.filter(key => !((key === 'dietNutrition' || key === 'vaccinesAdministered') && !wellnessData[key]?.trim())).map((key, index, arr) => <WellnessSection key={key} title={sectionLabels[key]} content={wellnessData[key]} onChange={v => handleSectionChange(key, v)} onRegenerate={i => handleSectionRegenerate(key, i)} isGenerating={isGenerating} isRegenerating={regeneratingSection === key} showDivider={index < arr.length - 1} />)}
          </div>
        </CardContent>
      </Card>
    </div>;
  return <div className="h-screen bg-background flex flex-col overflow-hidden" ref={containerRef}>
      <header className="border-b border-border bg-card px-3 md:px-6 py-3 md:py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" size="icon" onClick={() => navigate('/patients')} className="h-8 w-8 shrink-0"><ArrowLeft className="h-4 w-4" /></Button>
            <div className="min-w-0"><h1 className="text-lg md:text-xl font-semibold text-foreground truncate">Wellness Report</h1><p className="text-xs md:text-sm text-muted-foreground truncate flex items-center gap-1"><button onClick={handleCopyConsultId} className="flex items-center gap-1 font-mono text-[10px] hover:text-foreground transition-colors group"><span className="hidden sm:inline">ID: {consultId}</span><span className="sm:hidden">ID: {consultId?.slice(0, 8)}...</span>{copiedConsultId ? (<Check className="h-3 w-3 text-green-600" />) : (<Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />)}</button></p></div>
          </div>
          <div className="flex items-center gap-1 md:gap-2">
            <Button variant="ghost" size="sm" onClick={handleCopyAll} className="px-2">{copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}</Button>
            {isNative && (
              <Button variant="ghost" size="sm" onClick={handleShare} className="px-2"><Share2 className="h-4 w-4" /></Button>
            )}
            <Button variant="ghost" size="sm" onClick={handlePrint} className="px-2 hidden sm:flex"><Printer className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" onClick={handleDownload} className="px-2"><Download className="h-4 w-4" /></Button>
            <div className="h-6 w-px bg-border mx-1" />
            <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={isGenerating} className="gap-1.5 text-xs md:text-sm"><RefreshCw className={`h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`} /><span className="hidden sm:inline">Regenerate</span></Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving} className="gap-1.5 text-xs md:text-sm">{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}<span className="hidden sm:inline">Finalize</span></Button>
          </div>
        </div>
      </header>
      <div className="flex-1 min-h-0 pb-24 lg:pb-0 overflow-hidden">
        {isMobile ? (
          <div className="h-full overflow-y-auto">
            {reportContent}
          </div>
        ) : (
          <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
              <div className="h-full overflow-y-auto">
                {sidePanelContent}
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={80} minSize={60}>
              <div className="h-full overflow-y-auto">
                {reportContent}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
      {isMobile && (
        <EditorMobileBottomNav
          patientInfo={patientInfo}
          consultId={consultId || ''}
          currentReportType="wellness"
          onViewInput={() => setShowViewDialog(true)}
          onRecord={() => setShowRecordingDialog(true)}
          onUploadDiagnostics={() => setShowUploadDialog(true)}
          onPatientUpdated={loadConsultData}
        />
      )}
      <MinimizableAtlasChat transcription={transcription} isTranscribing={isTranscribing} patientInfo={patientInfo ? {
      patientId: patientInfo.patientId,
      name: patientInfo.name,
      species: patientInfo.species
    } : null} consultId={consultId || ''} key={transcriptionVersion} autoOpen={true} />
      <CopyFallbackDialog open={showFallback} onOpenChange={setShowFallback} title="Copy All Wellness Report" text={fallbackText} />
      <RegenerateDialog open={showRegenerateDialog} onOpenChange={setShowRegenerateDialog} onRegenerate={handleRegenerateWithInstruction} isGenerating={isGenerating} reportType="Wellness" />
      <ActiveRecordingDialog open={showRecordingDialog} onOpenChange={setShowRecordingDialog} onRecordingComplete={handleRecordingComplete} onBack={() => setShowRecordingDialog(false)} patientId={patientInfo?.patientId || ''} patientInfo={patientInfo ? {
      name: patientInfo.name,
      species: patientInfo.species,
      breed: patientInfo.breed
    } : null} />
      <UploadDiagnosticsDialog open={showUploadDialog} onOpenChange={setShowUploadDialog} consultId={consultId || ''} clinicId={clinicId} onUploadComplete={count => setUploadedFilesCount(prev => prev + count)} onAnalysisComplete={handleAnalysisComplete} />
      <ViewInputDialog open={showViewDialog} onOpenChange={setShowViewDialog} content={transcription} segments={transcriptionSegments} onSave={handleViewInputSave} inputMode={inputMode} consultId={consultId} />
    </div>;
}