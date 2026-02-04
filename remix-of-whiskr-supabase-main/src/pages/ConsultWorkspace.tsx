import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { formatInLocalTime } from "@/lib/timezone";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { Check, ArrowLeft, Home, Mail, Download, Users, MoreVertical, Link2, Share2, Copy, Unlock, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Consult, Patient } from "@/types";
import { AssignUsersDialog } from "@/components/consult/AssignUsersDialog";
import { ViewNotesDialog } from "@/components/consult/ViewNotesDialog";
import { CaseHistoryPanel } from "@/components/consult/CaseHistoryPanel";
import { ProcedureDetailsPanel } from "@/components/consult/ProcedureDetailsPanel";
import { VitalsDisplay } from "@/components/consult/VitalsDisplay";
import { usePermissions } from "@/hooks/use-permissions";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSidebar } from "@/components/ui/sidebar";
import { copyToClipboard, isIOS } from "@/utils/clipboard";
import { useIsMobile } from "@/hooks/use-mobile";
import { CopyFallbackDialog } from "@/components/ui/CopyFallbackDialog";
import { ConsultWorkspaceSkeleton } from '@/components/consult/ConsultWorkspaceSkeleton';

export default function ConsultWorkspace() {
  const {
    patientId,
    consultId
  } = useParams();
  const [searchParams] = useSearchParams();
  const inputMode = searchParams.get('mode') as 'recording' | 'typing' | null;
  const navigate = useNavigate();
  const {
    user,
    clinicId
  } = useAuth();
  const {
    toast
  } = useToast();
  const {
    setOpenMobile
  } = useSidebar();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [consult, setConsult] = useState<Consult | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasMessages, setHasMessages] = useState(false);
  const [currentConsultId, setCurrentConsultId] = useState<string | undefined>(consultId);
  const [visitType, setVisitType] = useState<string | null>(null);
  const [visitTypeDialogOpen, setVisitTypeDialogOpen] = useState(false);
  const [confirmationMode, setConfirmationMode] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailPreview, setEmailPreview] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [unfinalizeDialogOpen, setUnfinalizeDialogOpen] = useState(false);
  const [isUnfinalizing, setIsUnfinalizing] = useState(false);
  const [showCaseHistory, setShowCaseHistory] = useState(false);
  const [showPresentingComplaint, setShowPresentingComplaint] = useState(true);
  const permissions = usePermissions();
  const isMobile = useIsMobile();
  
  // Copy fallback dialog state
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [copyDialogText, setCopyDialogText] = useState("");
  const [copyDialogTitle, setCopyDialogTitle] = useState("");

  // Close sidebar on mount (mobile)
  useEffect(() => {
    setOpenMobile(false);
  }, [setOpenMobile]);

  // Realtime listener for patient updates (works with either URL patientId or loaded consult's patient)
  useEffect(() => {
    const effectivePatientId = patientId || patient?.id;
    if (!effectivePatientId) return;
    const channel = supabase.channel(`patient-${effectivePatientId}`).on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "patients",
      filter: `id=eq.${effectivePatientId}`
    }, payload => {
      setPatient(payload.new as Patient);
    }).subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [patientId, patient?.id]);
  useEffect(() => {
    if (!clinicId || !user) return;
    if (!patientId && !currentConsultId) return;
    const initializeConsult = async () => {
      // If consultId is provided, load existing consult
      if (currentConsultId) {
        const {
          data: existingConsult,
          error
        } = await supabase.from("consults").select("*, patient:patients(*)").eq("id", currentConsultId).eq("clinic_id", clinicId).maybeSingle();
        if (error) {
          console.error("Error loading consult:", error);
        }
        if (existingConsult) {
          setConsult(existingConsult);
          setVisitType((existingConsult as any).visit_type || null);
          setPatient(existingConsult.patient);

          // Prompt for visit type confirmation/selection ONLY if:
          // 1. Consult is draft AND user is DVM
          // 2. Visit type has NOT been confirmed yet (visit_type_confirmed_by is null)
          const visitTypeConfirmed = !!(existingConsult as any).visit_type_confirmed_by;
          if (existingConsult.status === 'draft' && permissions.isDVM && !visitTypeConfirmed) {
            const hasVisitType = !!(existingConsult as any).visit_type;
            if (hasVisitType) {
              // Visit type exists but not confirmed → confirmation mode
              setConfirmationMode(true);
              setVisitTypeDialogOpen(true);
            } else {
              // Visit type missing → selection mode
              setConfirmationMode(false);
              setVisitTypeDialogOpen(true);
            }
          }

          // Check if consultation has messages
          const {
            data: messages
          } = await supabase.from("chat_messages").select("id").eq("consult_id", currentConsultId).limit(1);
          setHasMessages((messages?.length || 0) > 0);
        } else {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Consultation not found"
          });
          navigate("/dashboard");
        }
      } else if (patientId) {
        // Check for existing draft consultation from today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayISO = today.toISOString();
        const {
          data: existingDrafts
        } = await supabase.from("consults").select("*, patient:patients(*)").eq("patient_id", patientId).eq("clinic_id", clinicId).in("status", ["draft", "in_progress"]).gte("created_at", todayISO).order("created_at", {
          ascending: false
        }).limit(1);
        if (existingDrafts && existingDrafts.length > 0) {
          // Found a draft from today - load it
          const draftConsult = existingDrafts[0];
          setConsult(draftConsult);
          setVisitType((draftConsult as any).visit_type || null);
          setPatient(draftConsult.patient);
          setCurrentConsultId(draftConsult.id);

          // Update URL to reflect the actual consult ID
          window.history.replaceState({}, "", `/consults/${draftConsult.id}`);

          // Check if consultation has messages
          const {
            data: messages
          } = await supabase.from("chat_messages").select("id").eq("consult_id", draftConsult.id).limit(1);
          setHasMessages((messages?.length || 0) > 0);
          toast({
            title: "Draft Loaded",
            description: "Continuing today's draft consultation"
          });
        } else {
          // No draft from today - fetch patient for new consult
          const {
            data: patientData
          } = await supabase.from("patients").select("*").eq("id", patientId).single();
          if (patientData) {
            setPatient(patientData);
          }
        }
      }
      setLoading(false);
    };
    initializeConsult();
  }, [patientId, currentConsultId, clinicId, user, navigate, toast]);
  const updateMessageCount = () => {
    if (!currentConsultId) return;
    supabase.from("chat_messages").select("id").eq("consult_id", currentConsultId).limit(1).then(({
      data
    }) => setHasMessages((data?.length || 0) > 0));
  };
  const handleConsultCreated = (newConsultId: string) => {
    setCurrentConsultId(newConsultId);
    // Update URL without reload
    window.history.replaceState({}, "", `/consults/${newConsultId}`);
  };
  const finalizeConsult = async () => {
    if (!consult || !user) return;
    if (!hasMessages) {
      toast({
        variant: "destructive",
        title: "Cannot Finalize",
        description: "Please add at least one message to the consultation before finalizing"
      });
      return;
    }

    // Create timeline entry
    const currentTimeline = (consult as any).timeline || [];
    const timelineEntry = {
      event: "finalized",
      by: user.id,
      at: new Date().toISOString(),
      version: (consult as any).version || 1
    };
    const {
      error
    } = await supabase.from("consults").update({
      status: "finalized",
      finalized_at: new Date().toISOString(),
      finalized_by: user.id,
      timeline: [...currentTimeline, timelineEntry]
    }).eq("id", consult.id);
    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to finalize consultation"
      });
    } else {
      toast({
        title: "Finalized",
        description: "Consultation has been finalized"
      });
      // Optimistically update local state and keep user on the page
      setConsult(prev => prev ? {
        ...prev,
        status: "finalized",
        finalized_at: new Date().toISOString(),
        finalized_by: user.id
      } as any : prev);
    }
  };
  const unfinalizeConsult = async () => {
    if (!consult || !user || !currentConsultId) return;
    setIsUnfinalizing(true);
    try {
      // Get session to ensure we have a valid access token
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.access_token) {
        toast({
          variant: "destructive",
          title: "Session Expired",
          description: "Please log in again."
        });
        return;
      }

      // Call the unfinalize edge function with RBAC enforcement
      const {
        data,
        error
      } = await supabase.functions.invoke("unfinalize-consult", {
        body: {
          consultId: currentConsultId
        },
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`
        }
      });
      if (error) {
        if (error.message?.includes("403") || error.message?.includes("restricted")) {
          toast({
            variant: "destructive",
            title: "Permission Denied",
            description: "Unfinalize is restricted to DVMs and Admins."
          });
        } else {
          throw error;
        }
        return;
      }
      toast({
        title: "Consultation Unfinalized",
        description: "Returned to Draft. You can now edit and update the consultation."
      });

      // Update local state
      setConsult(prev => prev ? {
        ...prev,
        status: "draft",
        finalized_at: null,
        finalized_by: null,
        version: (prev.version || 1) + 1
      } as any : prev);
      setUnfinalizeDialogOpen(false);
    } catch (error: any) {
      console.error("Unfinalize error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to unfinalize consultation"
      });
    } finally {
      setIsUnfinalizing(false);
    }
  };
  const sendTreatmentPlanEmail = async () => {
    if (!currentConsultId || !recipientEmail) return;

    // Check regeneration status first
    const {
      data: consultStatus
    } = await supabase.from("consults").select("regen_status").eq("id", currentConsultId).single();
    if (consultStatus?.regen_status === "pending") {
      toast({
        title: "Updating documents...",
        description: "Please wait a moment while AI regenerates the updated content.",
        variant: "default"
      });
      return;
    }
    setSendingEmail(true);
    try {
      // Pass visitType to determine if this is a procedure email
      const {
        error
      } = await supabase.functions.invoke("send-treatment-plan", {
        body: {
          consultId: currentConsultId,
          recipientEmail,
          format: "default",
          visitType: visitType || undefined
        }
      });
      if (error) throw error;
      toast({
        title: "Email Sent",
        description: `${visitType === 'procedure' ? 'Procedure summary' : 'Treatment plan'} sent to ${recipientEmail}`
      });
      setEmailDialogOpen(false);
      setRecipientEmail("");
      setEmailPreview("");
      setShowPreview(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to send email"
      });
    } finally {
      setSendingEmail(false);
    }
  };
  const generateEmailPreview = async () => {
    if (!currentConsultId) return;
    try {
      const {
        data: consultData,
        error
      } = await supabase.from("consults").select(`
          *,
          patient:patients(*),
          clinic:clinics(name, phone, address, clinic_email)
        `).eq("id", currentConsultId).single();
      if (error || !consultData) throw new Error("Failed to fetch consult data");

      // Prefer finalized data if available
      const useFinalPlan = consultData.final_treatment_plan || consultData.soap_p || "";

      // Generate AI summary using dedicated function (won't create chat messages) if no finalized summary
      let summary = consultData.final_summary || "";
      if (!summary) {
        const {
          data: summaryData
        } = await supabase.functions.invoke("generate-summary", {
          body: {
            consultId: currentConsultId
          }
        });
        summary = summaryData?.summary || "";
      }

      // Build email preview (plaintext for editing)
      let preview = `VETERINARY TREATMENT PLAN SUMMARY\n\n`;
      preview += `Patient: ${consultData.patient?.name || "N/A"}\n`;
      preview += `Date: ${new Date(consultData.started_at).toLocaleDateString()}\n\n`;
      if (summary) preview += `${summary}\n\n`;
      preview += `---\n\nFull details are included below.\n\n`;
      if (consultData.reason_for_visit) {
        preview += `REASON FOR VISIT\n${consultData.reason_for_visit}\n\n`;
      }
      if (consultData.soap_a) {
        preview += `DIAGNOSIS\n${consultData.soap_a}\n\n`;
      }
      if (useFinalPlan) {
        preview += `TREATMENT PLAN\n${useFinalPlan}\n\n`;
      }
      preview += `\nFor questions, please contact ${consultData.clinic?.name || "your veterinary clinic"}.`;
      setEmailPreview(preview);
      setShowPreview(true);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to generate preview"
      });
    }
  };
  const copyClientEmail = async () => {
    if (!currentConsultId) return;
    try {
      // Fetch ALL assistant messages from the database
      const {
        data: messages,
        error
      } = await supabase.from('chat_messages').select('content, created_at').eq('consult_id', currentConsultId).eq('role', 'assistant').order('created_at', {
        ascending: true
      }); // Get all messages in chronological order

      if (error || !messages || messages.length === 0) {
        toast({
          title: "No messages found",
          description: "Could not find any responses to copy",
          variant: "destructive"
        });
        return;
      }

      // Concatenate all messages in chronological order
      const fullContent = messages.map(m => m.content).join('\n\n');

      // Check if this is an euthanasia case
      const isEuthanasia = fullContent.includes('EUTHANASIA RECORD') || fullContent.includes('**EUTHANASIA RECORD**');
      
      if (isEuthanasia) {
        toast({
          title: "No Client Email",
          description: "Euthanasia cases do not include client communication emails",
          variant: "default"
        });
        return;
      }

      // For wellness visits, generate a client-friendly email
      if (visitType === 'wellness') {
        console.log('Generating wellness email...');
        const generateToast = toast({
          title: "Generating Email",
          description: "Creating client-friendly wellness summary...",
          duration: Infinity
        });
        try {
          const { data: generatedEmail, error: generateError } = await supabase.functions.invoke('generate-client-email', {
            body: {
              consultId: currentConsultId,
              visitType: visitType
            }
          });

          generateToast.dismiss();
          if (generateError) {
            console.error('Error generating email:', generateError);
            throw new Error('Failed to generate email');
          }
          if (generatedEmail?.emailContent) {
            // On mobile, use fallback dialog; on desktop, direct copy
            if (isMobile || isIOS()) {
              setCopyDialogText(generatedEmail.emailContent);
              setCopyDialogTitle("Copy Wellness Email");
              setShowCopyDialog(true);
              return;
            } else {
              const success = await copyToClipboard(generatedEmail.emailContent);
              toast({
                title: success ? "Email Generated & Copied!" : "Copy Failed",
                description: success ? "Client-friendly wellness email copied to clipboard" : "Failed to copy email. Please try again.",
                variant: success ? "default" : "destructive"
              });
              return;
            }
          } else {
            throw new Error('No email content received');
          }
        } catch (generateError) {
          console.error('Error in email generation:', generateError);
          generateToast.dismiss();
          toast({
            title: "Generation Failed",
            description: "Could not generate email. Please try again.",
            variant: "destructive"
          });
          return;
        }
      }

      // For other visit types (procedure, sickness, chronic), find "Client Discharge Email" or "Email to Client" section
      // Try multiple patterns to find the email section
      const emailPatterns = [
        /##\s*Client Discharge Email\s*\n/i, 
        /###\s*Client Discharge Email\s*\n/i, 
        /##\s*Discharge Email\s*\n/i, 
        /##\s*Email to Client\s*\n/i,
        /\*\*9\.\s*Email to Client\*\*/i,  // Numbered section format
        /9\.\s*Email to Client/i,           // Numbered section without bold
      ];
      let emailStartIndex = -1;
      let emailPattern = null;
      for (const pattern of emailPatterns) {
        const match = fullContent.match(pattern);
        if (match && match.index !== undefined) {
          emailStartIndex = match.index + match[0].length;
          emailPattern = pattern;
          break;
        }
      }
      if (emailStartIndex !== -1) {
        // Skip any duplicate title line immediately after the header
        const afterHeader = fullContent.substring(emailStartIndex);
        const duplicateTitleMatch = afterHeader.match(/^(Client Discharge Email|Discharge Email|Email to Client)\s*\n/i);
        if (duplicateTitleMatch) {
          emailStartIndex += duplicateTitleMatch[0].length;
        }

        // Skip "Subject Line:" and "Email Body:" labels if present (numbered format)
        const contentAfterStart = fullContent.substring(emailStartIndex);
        const subjectMatch = contentAfterStart.match(/^\*\*Subject Line:\*\*[^\n]*\n/i);
        if (subjectMatch) {
          emailStartIndex += subjectMatch[0].length;
        }
        const emailBodyMatch = fullContent.substring(emailStartIndex).match(/^\*\*Email Body:\*\*\s*\n/i);
        if (emailBodyMatch) {
          emailStartIndex += emailBodyMatch[0].length;
        }

        // Find the end - look for next section (markdown ## or numbered section) or end of content
        const remainingContent = fullContent.substring(emailStartIndex);
        const nextMarkdownSection = remainingContent.indexOf('\n##');
        const nextNumberedSection = remainingContent.search(/\n\*?\*?\d+\.\s+[A-Z]/); // Matches "\n1. " or "\n**2. "
        
        let endIndex = fullContent.length;
        if (nextMarkdownSection !== -1 && nextNumberedSection !== -1) {
          endIndex = emailStartIndex + Math.min(nextMarkdownSection, nextNumberedSection);
        } else if (nextMarkdownSection !== -1) {
          endIndex = emailStartIndex + nextMarkdownSection;
        } else if (nextNumberedSection !== -1) {
          endIndex = emailStartIndex + nextNumberedSection;
        }
        
        let emailContent = fullContent.substring(emailStartIndex, endIndex).trim();

        // Clean markdown formatting and special characters
        const cleanEmail = emailContent.replace(/^#{1,6}\s+/gm, '') // Remove headers
        .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold
        .replace(/\*(.+?)\*/g, '$1') // Remove italic/asterisks
        .replace(/^[\s]*[-*+]\s+/gm, '- ') // Convert bullets to hyphens
        .replace(/^[\s]*\d+\.\s+/gm, '') // Remove numbered list markers
        .replace(/\n{3,}/g, '\n\n') // Clean excessive whitespace
        .trim();
        if (cleanEmail && cleanEmail.length > 10) {
          // On mobile, use fallback dialog; on desktop, direct copy
          if (isMobile || isIOS()) {
            setCopyDialogText(cleanEmail);
            setCopyDialogTitle("Copy Discharge Email");
            setShowCopyDialog(true);
            return;
          } else {
            const success = await copyToClipboard(cleanEmail);
            toast({
              title: success ? "Discharge email copied!" : "Copy Failed",
              description: success ? "Client discharge email copied to clipboard" : "Failed to copy email. Please try again.",
              variant: success ? "default" : "destructive"
            });
            return;
          }
        }
      }

      // If we get here, no email content was found - generate it
      console.log('No existing email found, generating new email...');
      const generateToast = toast({
        title: "Generating Email",
        description: "Creating client email based on consultation...",
        duration: Infinity // Keep showing until we're done
      });
      try {
        const {
          data: generatedEmail,
          error: generateError
        } = await supabase.functions.invoke('generate-client-email', {
          body: {
            consultId: currentConsultId,
            visitType: visitType
          }
        });

        // Dismiss the generating toast
        generateToast.dismiss();
        if (generateError) {
          console.error('Error generating email:', generateError);
          throw new Error('Failed to generate email');
        }
        if (generatedEmail?.emailContent) {
          // Sanitize to plain text (no markdown, no special chars)
          const cleanGenerated = generatedEmail.emailContent.replace(/^#{1,6}\s+/gm, '') // Remove headers
          .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold
          .replace(/\*(.+?)\*/g, '$1') // Remove italic/asterisks
          .replace(/^[\s]*[-*+•]\s+/gm, '- ') // Remove bullet markers
          .replace(/^[\s]*\d+\.\s+/gm, '') // Remove numbered list markers
          .replace(/\n{3,}/g, '\n\n') // Clean excessive whitespace
          .replace(/[^\x00-\x7F\n]/g, '') // Remove non-ascii
          .trim();
          // On mobile, use fallback dialog; on desktop, direct copy
          if (isMobile || isIOS()) {
            setCopyDialogText(cleanGenerated);
            setCopyDialogTitle("Copy Client Email");
            setShowCopyDialog(true);
            return;
          } else {
            const success = await copyToClipboard(cleanGenerated);
            toast({
              title: success ? "Email Generated & Copied!" : "Copy Failed",
              description: success ? "Client email has been generated and copied to clipboard" : "Failed to copy email. Please try again.",
              variant: success ? "default" : "destructive"
            });
            return;
          }
        } else {
          throw new Error('No email content received');
        }
      } catch (generateError) {
        console.error('Error in email generation:', generateError);
        generateToast.dismiss();
        toast({
          title: "Generation Failed",
          description: "Could not generate email. Please try again.",
          variant: "destructive"
        });
        return;
      }
    } catch (error) {
      console.error('Error copying email:', error);
      toast({
        title: "Copy failed",
        description: "Could not copy email to clipboard",
        variant: "destructive"
      });
    }
  };
  const copyLatestNotes = async () => {
    if (!currentConsultId) return;
    try {
      // Fetch ALL assistant messages from the database
      const {
        data: messages,
        error
      } = await supabase.from('chat_messages').select('content, created_at').eq('consult_id', currentConsultId).eq('role', 'assistant').order('created_at', {
        ascending: true
      }); // Get all messages in chronological order

      if (error || !messages || messages.length === 0) {
        toast({
          title: "No messages found",
          description: "Could not find any responses to copy",
          variant: "destructive"
        });
        return;
      }

      // Concatenate all messages in chronological order
      const fullContent = messages.map(m => m.content).join('\n\n');

      // For wellness visits, copy SOAP content excluding Visit Header and Clinician Signature
      if (visitType === 'wellness') {
        // Include complete wellness record starting from the beginning
        // Find end at Client Education (include it)
        const clientEducationMatch = fullContent.match(/##?\s*Client Education/i);
        let endIndex = fullContent.length;
        
        if (clientEducationMatch) {
          // Find the next section after Client Education or end of content
          const nextSectionAfterEducation = fullContent.indexOf('\n##', clientEducationMatch.index! + clientEducationMatch[0].length);
          if (nextSectionAfterEducation !== -1) {
            endIndex = nextSectionAfterEducation;
          }
        }

        let wellnessContent = fullContent.substring(0, endIndex);

        // Clean markdown formatting while preserving special characters
        const cleanWellness = wellnessContent
        .replace(/^#{1,2}\s+(.+)$/gm, '\n$1\n') // Main headers: remove # but keep text with spacing
        .replace(/^#{3}\s+(.+)$/gm, '\n  $1') // Subsection headers (###): indent
        .replace(/^#{4}\s+(.+)$/gm, '    $1:') // Sub-subsections (####): indent more with colon
        .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold markdown
        .replace(/\*(.+?)\*/g, '$1') // Remove italic markdown
        .replace(/^[\s]*[-*+]\s+/gm, '  - ') // Convert bullets to indented dashes
        .replace(/^[\s]*(\d+)\.\s+/gm, '  $1. ') // Preserve numbered lists with indent
        .replace(/°/g, '°') // Preserve degree symbol
        .replace(/–/g, '–') // Preserve en-dash
        .replace(/—/g, '—') // Preserve em-dash
        .replace(/✓/g, '✓') // Preserve checkmark
        .replace(/•/g, '•') // Preserve bullet point
        .replace(/[^\x00-\x7F°–—✓•]/g, '') // Remove non-ASCII except preserved characters
        .replace(/\n{4,}/g, '\n\n') // Limit to max 2 newlines
        .replace(/([a-z])\n([A-Z])/g, '$1\n\n$2') // Add spacing between sections
        .replace(/Clinic Contact:?\s*$/gm, 'Clinic Contact: [Contact clinic for details]')
        .trim();
        // On mobile, use fallback dialog; on desktop, direct copy
        if (isMobile || isIOS()) {
          setCopyDialogText(cleanWellness);
          setCopyDialogTitle("Copy Wellness Record");
          setShowCopyDialog(true);
          return;
        } else {
          const success = await copyToClipboard(cleanWellness);
          toast({
            title: success ? "Wellness record copied!" : "Copy Failed",
            description: success ? "Complete wellness record copied to clipboard" : "Failed to copy wellness record. Please try again.",
            variant: success ? "default" : "destructive"
          });
          return;
        }
      }

      // For euthanasia cases - detect by checking for "EUTHANASIA RECORD" section
      if (fullContent.includes('EUTHANASIA RECORD') || fullContent.includes('**EUTHANASIA RECORD**')) {
        console.log('Detected euthanasia case, copying full formatted content');
        
        // Clean markdown formatting for clean copying
        const euthanasiaText = fullContent
          .replace(/^#{1,2}\s+/gm, '') // Remove markdown headers (# or ##)
          .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold markers **text**
          .replace(/\*(.+?)\*/g, '$1') // Remove italic markers *text*
          .replace(/^[\s]*[-*+•]\s+/gm, '- ') // Standardize bullets
          .replace(/°/g, '°') // Preserve degree symbol
          .replace(/\n{3,}/g, '\n\n') // Limit excessive newlines
          .trim();

        // On mobile, use fallback dialog; on desktop, direct copy
        if (isMobile || isIOS()) {
          setCopyDialogText(euthanasiaText);
          setCopyDialogTitle("Copy Euthanasia Record");
          setShowCopyDialog(true);
          return;
        } else {
          const success = await copyToClipboard(euthanasiaText);
          toast({
            title: success ? "Euthanasia record copied!" : "Copy Failed",
            description: success ? "Complete euthanasia documentation copied to clipboard" : "Failed to copy euthanasia record. Please try again.",
            variant: success ? "default" : "destructive"
          });
          return;
        }
      }

      // For other visit types (procedure, sickness, chronic), extract specific SOAP sections
      // Use a simpler extraction approach that captures everything including subsections

      // Define the sections we want in order
      // For procedures: EXCLUDE section 9 "Email to Client" (keep section 8 "Client Communication")
      const sectionOrder = visitType === 'procedure' 
        ? ['Procedure Summary', 'Pre-Procedure Assessment', 'Anesthetic Protocol', 'Procedure Details', 'Medications Administered', 'Post-Procedure Status', 'Follow-up Instructions', 'Client Communication'] 
        : ['Summary', 'Subjective Summary', 'Subjective', 'Vitals', 'Physical Examination', 'Physical Exam', 'Assessment and Differential Diagnoses', 'Assessment', 'Diagnostic Plan', 'Working Diagnosis and Treatment Plan', 'Treatment Plan', 'Prognosis'];
      let extractedText = '';
      const processedSections = new Set<string>();

      // Extract each section by finding its header and capturing everything until the next major section
      for (const sectionTitle of sectionOrder) {
        // Skip if we already processed a variation of this section
        const normalizedTitle = sectionTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (processedSections.has(normalizedTitle)) continue;

        // Try to find this section header in multiple formats:
        // 1. Markdown headers: ## Title or ### Title
        // 2. Numbered sections: **1. Title** or 1. Title
        const escapedTitle = sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const headerPatterns = [
          new RegExp(`^#{2,3}\\s+${escapedTitle}\\s*$`, 'mi'),                    // ## Title
          new RegExp(`^\\*\\*\\d+\\.\\s+${escapedTitle}\\*\\*\\s*$`, 'mi'),        // **1. Title**
          new RegExp(`^\\d+\\.\\s+${escapedTitle}\\s*$`, 'mi'),                    // 1. Title
        ];
        
        let match = null;
        for (const pattern of headerPatterns) {
          match = fullContent.match(pattern);
          if (match && match.index !== undefined) break;
        }
        
        if (!match || match.index === undefined) continue;

        // Found the section - extract everything from after the header until the next major section
        const sectionStart = match.index + match[0].length;
        const remainingContent = fullContent.substring(sectionStart);

        // Find the next major section header (markdown ## or numbered section)
        const nextMarkdownHeader = remainingContent.match(/\n#{2,3}\s+[A-Z]/);
        const nextNumberedSection = remainingContent.match(/\n\*?\*?\d+\.\s+[A-Z]/);
        
        let sectionEnd = remainingContent.length;
        if (nextMarkdownHeader && nextNumberedSection) {
          sectionEnd = Math.min(nextMarkdownHeader.index!, nextNumberedSection.index!);
        } else if (nextMarkdownHeader) {
          sectionEnd = nextMarkdownHeader.index!;
        } else if (nextNumberedSection) {
          sectionEnd = nextNumberedSection.index!;
        }
        
        let sectionContent = remainingContent.substring(0, sectionEnd).trim();
        if (sectionContent) {
          // Mark this section type as processed
          processedSections.add(normalizedTitle);

          // Add section header (bolded) and content
          extractedText += `**${sectionTitle}**\n`;
          extractedText += sectionContent + '\n\n';
        }
      }
      if (!extractedText.trim()) {
        toast({
          title: "No notes found",
          description: "Could not extract consultation notes",
          variant: "destructive"
        });
        return;
      }

      // Clean and format the extracted text for better readability
      const cleanNotes = extractedText
      // First, handle subsection headers (####) - make them indented with clear formatting
      .replace(/^####\s+(.+)$/gm, '\n  $1:')
      // Remove remaining markdown headers (###, ##, #) but keep the text
      .replace(/^#{1,3}\s+/gm, '')
      // Remove bold markers EXCEPT for section headers (preserve **Section Title** at start of line)
      .split('\n').map(line => {
        // Keep bold for section headers (lines starting with **Text**)
        if (/^\*\*[A-Z][\w\s&-]+\*\*\s*$/.test(line.trim())) {
          return line;
        }
        // Remove bold from content lines
        return line.replace(/\*\*(.+?)\*\*/g, '$1');
      }).join('\n')
      // Remove italic markers but keep the text
      .replace(/\*(.+?)\*/g, '$1')
      // Standardize all bullet points to use "  - " (indented dash)
      .replace(/^[\s]*[-*+•]\s+/gm, '  - ')
      // Keep numbered lists but ensure consistent formatting
      .replace(/^[\s]*(\d+)\.\s+/gm, '  $1. ')
      // Add spacing after section headers (lines that end with colon and don't have bullets)
      .replace(/^([A-Z][^\n:]*:?)$/gm, '\n$1')
      // Clean up excessive whitespace (more than 3 line breaks)
      .replace(/\n{4,}/g, '\n\n\n')
      // Remove non-ASCII but keep degree symbol for temperature
      .replace(/[^\x00-\x7F°\n]/g, '')
      // Final trim
      .trim();
      // On mobile, use fallback dialog; on desktop, direct copy
      if (isMobile || isIOS()) {
        setCopyDialogText(cleanNotes);
        setCopyDialogTitle("Copy SOAP Notes");
        setShowCopyDialog(true);
        return;
      } else {
        const success = await copyToClipboard(cleanNotes);
        toast({
          title: success ? "SOAP Copied!" : "Copy Failed",
          description: success ? "SOAP notes copied to clipboard" : "Failed to copy SOAP notes. Please try again.",
          variant: success ? "default" : "destructive"
        });
      }
    } catch (error) {
      console.error('Error copying notes:', error);
      toast({
        title: "Copy failed",
        description: "Could not copy notes to clipboard",
        variant: "destructive"
      });
    }
  };
  const exportTreatmentPlan = async () => {
    if (!currentConsultId) return;

    // Check regeneration status first
    const {
      data: consultStatus
    } = await supabase.from("consults").select("regen_status").eq("id", currentConsultId).single();
    if (consultStatus?.regen_status === "pending") {
      toast({
        title: "Updating documents...",
        description: "Please wait a moment while AI regenerates the updated content.",
        variant: "default"
      });
      return;
    }
    try {
      // Fetch full consult data for export
      const {
        data: consultData,
        error
      } = await supabase.from("consults").select(`
          *,
          patient:patients(*),
          clinic:clinics(name, phone, address, clinic_email, logo_url)
        `).eq("id", currentConsultId).single();

      // Fetch vet profile separately if needed
      let vetName = null;
      if (consultData?.vet_user_id) {
        const {
          data: vetProfile
        } = await supabase.from("profiles").select("name").eq("user_id", consultData.vet_user_id).single();
        vetName = vetProfile?.name;
      }
      if (error || !consultData) throw new Error("Failed to fetch consult data");

      // Generate discharge plan using AI
      toast({
        title: "Generating discharge plan...",
        description: "Please wait while we create your discharge document."
      });
      const {
        data: dischargePlanData,
        error: dischargePlanError
      } = await supabase.functions.invoke("generate-discharge-plan", {
        body: {
          consultId: currentConsultId
        }
      });
      if (dischargePlanError) {
        console.error("Discharge plan error:", dischargePlanError);
        throw new Error(dischargePlanError.message || "Failed to generate discharge plan");
      }
      if (!dischargePlanData?.dischargePlan) {
        console.error("No discharge plan returned:", dischargePlanData);
        throw new Error("No discharge plan content received from AI");
      }
      const dischargePlanContent = dischargePlanData.dischargePlan;
      console.log("Discharge plan received:", dischargePlanContent.substring(0, 200));

      // Generate PDF instead of text file
      const {
        jsPDF
      } = await import("jspdf");
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const maxWidth = pageWidth - 2 * margin;
      let yPos = 20;

      // Header with clinic info
      doc.setFontSize(24);
      doc.setTextColor(30, 58, 138); // Primary blue #1e3a8a
      doc.text(consultData.clinic?.name || "Veterinary Clinic", margin, yPos);
      yPos += 10;
      doc.setFontSize(10);
      doc.setTextColor(80, 80, 80);
      if (consultData.clinic?.address) {
        doc.text(consultData.clinic.address, margin, yPos);
        yPos += 5;
      }
      if (consultData.clinic?.phone) {
        doc.text(`Phone: ${consultData.clinic.phone}`, margin, yPos);
        yPos += 5;
      }
      if (consultData.clinic?.clinic_email) {
        doc.text(`Email: ${consultData.clinic.clinic_email}`, margin, yPos);
        yPos += 5;
      }

      // Divider line
      yPos += 8;
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 10;

      // Derive age from text if DOB is missing
      const extractAgeFromText = (t: string) => {
        const m = (t || "").match(/(\d{1,2})-year-old/);
        return m ? parseInt(m[1], 10) : null;
      };
      const derivedAge = extractAgeFromText(consultData.final_summary || consultData.soap_s || consultData.reason_for_visit || "");

      // Patient Information
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text("PATIENT INFORMATION", margin, yPos);
      doc.setFont("helvetica", "normal");
      yPos += 8;
      doc.setFontSize(10);
      doc.setTextColor(51, 51, 51);
      doc.text(`Patient Name: ${consultData.patient?.name || "N/A"}`, margin, yPos);
      yPos += 6;
      doc.text(`Species: ${consultData.patient?.species || "N/A"}`, margin, yPos);
      yPos += 6;
      if (consultData.patient?.breed) {
        doc.text(`Breed: ${consultData.patient.breed}`, margin, yPos);
        yPos += 6;
      }
      // Show age
      if (consultData.patient?.date_of_birth) {
        const birthDate = new Date(consultData.patient.date_of_birth);
        const today = new Date();
        const ageYears = today.getFullYear() - birthDate.getFullYear();
        const ageMonths = today.getMonth() - birthDate.getMonth();
        let ageText = "";
        if (ageYears > 0) {
          ageText = `${ageYears} year${ageYears > 1 ? "s" : ""}`;
          if (ageMonths > 0) {
            ageText += ` ${ageMonths} month${ageMonths > 1 ? "s" : ""}`;
          }
        } else if (ageMonths > 0) {
          ageText = `${ageMonths} month${ageMonths > 1 ? "s" : ""}`;
        } else {
          const ageDays = Math.floor((today.getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24));
          ageText = `${ageDays} day${ageDays > 1 ? "s" : ""}`;
        }
        doc.text(`Age: ${ageText}`, margin, yPos);
        yPos += 6;
      } else if (derivedAge !== null) {
        doc.text(`Age: ${derivedAge} years`, margin, yPos);
        yPos += 6;
      }
      doc.text(`Consultation Date: ${formatInLocalTime(consultData.started_at, 'MMM d, yyyy')}`, margin, yPos);
      yPos += 6;
      if (vetName) {
        doc.text(`Veterinarian: ${vetName}`, margin, yPos);
        yPos += 6;
      }
      yPos += 10;

      // Clinical sections divider
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 10;

      // Helper function to extract sections from AI response
      const extractSection = (sectionName: string, text: string) => {
        if (!text || typeof text !== 'string') {
          console.warn(`Invalid text provided to extractSection for: ${sectionName}`);
          return '';
        }
        const regex = new RegExp(`###+?\\s*${sectionName}[:\\s]*([\\s\\S]*?)(?=###|##|$)`, 'i');
        const match = text.match(regex);
        if (!match || !match[1]) return '';

        // Clean markdown formatting
        return match[1].trim().replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold markdown
        .replace(/\*(.+?)\*/g, '$1') // Remove italic markdown
        .replace(/^[-•]\s+/gm, '• '); // Normalize bullet points
      };

      // Helper function to add section with page break handling
      const addSection = (title: string, content: string) => {
        if (!content) return;
        if (yPos > 250) {
          doc.addPage();
          yPos = 20;
        }
        doc.setFontSize(14);
        doc.setTextColor(30, 58, 138);
        doc.text(title, margin, yPos);
        yPos += 7;
        doc.setFontSize(10);
        doc.setTextColor(51, 51, 51);
        const lines = doc.splitTextToSize(content, maxWidth);
        for (let i = 0; i < lines.length; i++) {
          if (yPos > 280) {
            doc.addPage();
            yPos = 20;
          }
          doc.text(lines[i], margin, yPos);
          yPos += 5;
        }
        yPos += 5;
      };

      // Parse AI-generated discharge plan
      if (!dischargePlanContent) {
        throw new Error("Discharge plan content is empty");
      }
      const dischargePlan = dischargePlanContent;
      console.log("Processing discharge plan sections...");

      // Title
      doc.setFontSize(18);
      doc.setTextColor(30, 58, 138);
      doc.text("DISCHARGE PLAN", margin, yPos);
      yPos += 12;

      // DISCHARGE PLANNING SECTIONS from AI

      // 1. Clinical signs to monitor
      const clinicalSigns = extractSection('Clinical Signs to Monitor', dischargePlan);
      if (clinicalSigns) {
        addSection("CLINICAL SIGNS TO MONITOR", clinicalSigns);
      }

      // 2. Treatment plan
      const treatmentPlan = extractSection('Treatment Plan', dischargePlan);
      if (treatmentPlan) {
        addSection("TREATMENT PLAN", treatmentPlan);
      }

      // 3. Expected recovery timeline
      const recoveryTimeline = extractSection('Expected Recovery Timeline|Recovery Timeline', dischargePlan);
      if (recoveryTimeline) {
        addSection("EXPECTED RECOVERY TIMELINE", recoveryTimeline);
      }

      // 4. When to call or return
      const whenToCall = extractSection('When to Call or Return', dischargePlan);
      if (whenToCall) {
        addSection("WHEN TO CALL OR RETURN", whenToCall);
      }

      // 5. Follow-up tests or rechecks
      const followUp = extractSection('Follow-Up Tests or Rechecks|Follow-up', dischargePlan);
      if (followUp) {
        addSection("FOLLOW-UP TESTS OR RECHECKS", followUp);
      }

      // 6. Prevention tips
      const prevention = extractSection('Prevention Tips', dischargePlan);
      if (prevention) {
        addSection("PREVENTION TIPS", prevention);
      }

      // Disclaimer box at bottom (yellow background with warning icon)
      if (yPos > 240) {
        doc.addPage();
        yPos = 20;
      }
      yPos += 15;
      doc.setFillColor(254, 249, 195); // Yellow background
      doc.setDrawColor(234, 179, 8); // Yellow border
      doc.rect(margin - 5, yPos - 5, maxWidth + 10, 30, "FD");
      doc.setFontSize(10);
      doc.setTextColor(80, 80, 80);
      doc.setFont("helvetica", "bold");
      doc.text("DISCLAIMER", margin, yPos + 2);
      doc.setFont("helvetica", "normal");
      yPos += 8;
      doc.setFontSize(8);
      const disclaimerText = "This treatment plan was generated with AI assistance. Please review all recommendations carefully and use your professional judgment. Always verify dosages and contraindications before implementation.";
      const disclaimerLines = doc.splitTextToSize(disclaimerText, maxWidth - 5);
      doc.text(disclaimerLines, margin, yPos);

      // Company footer on all pages
      const pageCount = doc.internal.pages.length - 1;
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        const footerY = doc.internal.pageSize.getHeight() - 15;
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        doc.setFont("helvetica", "italic");
        doc.text("Powered by whiskr.ai | support@whiskr.ai | www.whiskr.ai", pageWidth / 2, footerY, {
          align: "center"
        });
      }

      // Save PDF with local date in filename
      const localDate = formatInLocalTime(new Date(), 'yyyy-MM-dd');
      doc.save(`treatment-plan-${consultData.patient?.name || "patient"}-${localDate}.pdf`);
      toast({
        title: "Export Complete",
        description: "Treatment plan downloaded successfully"
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: error.message || "Failed to export treatment plan"
      });
    }
  };
  if (loading) {
    return <ConsultWorkspaceSkeleton />;
  }
  if (!patient) {
    return <div className="text-center py-12">
        <p className="text-muted-foreground">Patient not found</p>
      </div>;
  }
  const calculateAge = (dateOfBirth?: string) => {
    if (!dateOfBirth) return null;
    const birth = new Date(dateOfBirth);
    const today = new Date();
    let years = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();

    // Subtract a year if birthday hasn't occurred yet this year
    if (monthDiff < 0 || monthDiff === 0 && today.getDate() < birth.getDate()) {
      years--;
    }
    return years;
  };
  const formatPresentingComplaint = (text: string) => {
    if (!text) return '';
    // Capitalize first letter and ensure proper sentence formatting
    return text.charAt(0).toUpperCase() + text.slice(1);
  };
  return <div className="flex flex-col h-full animate-fade-in">
      {/* Visit Type Dialog */}
      <Dialog open={visitTypeDialogOpen} onOpenChange={setVisitTypeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmationMode ? 'Confirm Visit Type' : 'Select Visit Type'}
            </DialogTitle>
            <DialogDescription>
              {confirmationMode ? `The system has categorized this as a ${visitType === 'sickness' ? 'Sickness/Emergency' : visitType === 'chronic' ? 'Chronic Illness' : visitType === 'wellness' ? 'Wellness/Vaccine' : 'Procedure'} visit. Please confirm or change if needed.` : 'Please select the type of visit for this consultation'}
            </DialogDescription>
          </DialogHeader>

          {confirmationMode ? (/* Confirmation Mode UI */
        <div className="space-y-4">
              <div className="flex items-center justify-center p-4 rounded-lg border-2 bg-muted/50">
                <Badge variant="outline" className={cn("text-base px-4 py-2", visitType === 'sickness' ? 'bg-red-500/10 text-red-500 border-red-500/20' : visitType === 'chronic' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' : visitType === 'wellness' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-blue-500/10 text-blue-500 border-blue-500/20')}>
                  {visitType === 'sickness' ? 'Sickness / Emergency' : visitType === 'chronic' ? 'Chronic Illness' : visitType === 'wellness' ? 'Wellness / Vaccine' : visitType === 'procedure' ? 'Procedure' : visitType}
                </Badge>
              </div>
              <div className="flex flex-col gap-2">
                <Button onClick={async () => {
              if (visitType && currentConsultId) {
                const {
                  error
                } = await supabase.from('consults').update({
                  visit_type: visitType,
                  visit_type_confirmed_by: user?.id,
                  visit_type_confirmed_at: new Date().toISOString()
                }).eq('id', currentConsultId);
                if (error) {
                  console.error('Visit type confirmation error:', error);
                  toast({
                    title: "Error",
                    description: "Failed to confirm visit type",
                    variant: "destructive"
                  });
                } else {
                  setVisitTypeDialogOpen(false);
                  toast({
                    title: "Visit Type Confirmed",
                    description: "The consultation workflow has been confirmed."
                  });
                }
              }
            }} disabled={!visitType} className="w-full">
                  <Check className="mr-2 h-4 w-4" />
                  Confirm {visitType === 'sickness' ? 'Sickness/Emergency' : visitType === 'chronic' ? 'Chronic' : visitType === 'wellness' ? 'Wellness' : 'Procedure'}
                </Button>
                <Button variant="outline" onClick={() => setConfirmationMode(false)} className="w-full">
                  Change Visit Type
                </Button>
              </div>
            </div>) : (/* Selection Mode UI */
        <div className="space-y-4">
              <Select value={visitType || ''} onValueChange={setVisitType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select visit type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sickness">Sickness / Emergency</SelectItem>
                  <SelectItem value="chronic">Chronic Illness</SelectItem>
                  <SelectItem value="wellness">Wellness / Vaccine</SelectItem>
                  <SelectItem value="procedure">Procedure</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={async () => {
            if (visitType && currentConsultId) {
              // Get current visit type before changing
              const { data: currentConsult } = await supabase
                .from('consults')
                .select('visit_type')
                .eq('id', currentConsultId)
                .single();
              
              const oldVisitType = currentConsult?.visit_type;
              
              // Update visit type
              const {
                error
              } = await supabase.from('consults').update({
                visit_type: visitType,
                visit_type_confirmed_by: user?.id,
                visit_type_confirmed_at: new Date().toISOString()
              }).eq('id', currentConsultId);
              
              if (error) {
                console.error('Visit type update error:', error);
                toast({
                  title: "Error",
                  description: "Failed to update visit type",
                  variant: "destructive"
                });
              } else {
                // Insert system message if visit type actually changed
                if (oldVisitType && oldVisitType !== visitType) {
                  const formatVisitType = (type: string) => {
                    const typeMap: Record<string, string> = {
                      'sickness': 'Sickness / Emergency',
                      'chronic': 'Chronic Illness',
                      'wellness': 'Wellness / Vaccine',
                      'procedure': 'Procedure'
                    };
                    return typeMap[type] || type;
                  };
                  
                  await supabase
                    .from('chat_messages')
                    .insert({
                      clinic_id: clinicId,
                      user_id: user?.id,
                      consult_id: currentConsultId,
                      role: 'system',
                      content: `Visit type changed from ${formatVisitType(oldVisitType)} to ${formatVisitType(visitType)}`,
                      sender_name: user?.email
                    });
                }
                
                setVisitTypeDialogOpen(false);
                toast({
                  title: "Visit Type Updated",
                  description: "The consultation workflow has been updated. Reloading..."
                });
                // Reload the page to refresh the chat context with new visit type
                setTimeout(() => window.location.reload(), 500);
              }
            }
          }} disabled={!visitType} className="w-full">
                Save Visit Type
              </Button>
            </div>)}
        </DialogContent>
      </Dialog>

      {/* Compact Header */}
      <div className="flex items-center justify-between px-2 sm:px-4 py-3 border-b bg-background gap-2">
        <div className="flex items-center gap-1 sm:gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/consults")} className="h-8 px-2">
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only sm:not-sr-only sm:ml-1">Back</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="h-8 px-2 hidden sm:flex">
            <Home className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Home</span>
          </Button>
        </div>
        <div className="flex-1 flex flex-col items-center min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm sm:text-base font-semibold truncate text-center">
              {patient && patient.name !== "Unknown" ? <Link to={`/patients/${patient.id}`} className="hover:text-primary hover:underline">
                  {patient.name}
                </Link> : "New Patient"}
              {calculateAge(patient?.date_of_birth) && ` (${calculateAge(patient.date_of_birth)} yo)`}
            </h1>
            {visitType && permissions.isDVM && consult?.status !== "finalized" && <Badge variant="outline" className={cn("cursor-pointer hover:opacity-80 transition-opacity", visitType === 'sickness' ? 'bg-red-500/10 text-red-500 border-red-500/20' : visitType === 'chronic' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' : visitType === 'wellness' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-blue-500/10 text-blue-500 border-blue-500/20')} onClick={() => {
            setConfirmationMode(false);
            setVisitTypeDialogOpen(true);
          }}>
                {visitType === 'sickness' ? 'Sickness / Emergency' : visitType === 'chronic' ? 'Chronic' : visitType === 'wellness' ? 'Wellness' : visitType === 'procedure' ? 'Procedure' : visitType}
              </Badge>}
            {visitType && (!permissions.isDVM || consult?.status === "finalized") && <Badge variant="outline" className={cn(visitType === 'sickness' ? 'bg-red-500/10 text-red-500 border-red-500/20' : visitType === 'chronic' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' : visitType === 'wellness' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-blue-500/10 text-blue-500 border-blue-500/20')}>
                {visitType === 'sickness' ? 'Sickness / Emergency' : visitType === 'chronic' ? 'Chronic' : visitType === 'wellness' ? 'Wellness' : visitType === 'procedure' ? 'Procedure' : visitType}
              </Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            {patient?.species && `${patient.species}`}
            {patient?.sex && ` • ${patient.sex}`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {consult && currentConsultId && <>
              <ViewNotesDialog consultId={currentConsultId} />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <AssignUsersDialog consultId={currentConsultId} patientName={patient?.name} disabled={!permissions.canEditClinicalData} />
                    </span>
                  </TooltipTrigger>
                  {!permissions.canEditClinicalData && <TooltipContent>
                      <p>Only vets or techs can assign team members</p>
                    </TooltipContent>}
                </Tooltip>
              </TooltipProvider>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-8 px-2">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {consult?.status === "finalized" && permissions.canUnfinalizeConsult && <>
                      <DropdownMenuItem onClick={() => setUnfinalizeDialogOpen(true)}>
                        <Unlock className="h-4 w-4 mr-2" />
                        Unfinalize Consultation
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>}
                  <DropdownMenuItem onClick={() => setShowCaseHistory(!showCaseHistory)}>
                    <History className="h-4 w-4 mr-2" />
                    {showCaseHistory ? "Hide" : "Show"} Case History
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={async () => {
                const url = `${window.location.origin}/consults/${currentConsultId}`;
                const success = await copyToClipboard(url);
                toast({
                  title: success ? "Link copied" : "Copy Failed",
                  description: success ? "Consultation link copied to clipboard" : "Failed to copy link",
                  variant: success ? "default" : "destructive"
                });
              }}>
                    <Link2 className="h-4 w-4 mr-2" />
                    Copy Consultation Link
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={async () => {
                // Get users in the clinic to share with
                const {
                  data: clinicUsers
                } = await supabase.from("profiles").select("user_id, name, email").eq("clinic_id", clinicId);
                if (!clinicUsers || clinicUsers.length === 0) {
                  toast({
                    title: "No users to share with",
                    description: "No other users in your clinic"
                  });
                  return;
                }

                // For now, just copy the link - full share dialog can be added later
                const url = `${window.location.origin}/consults/${currentConsultId}`;
                const success = await copyToClipboard(url);
                toast({
                  title: success ? "Link copied" : "Copy Failed",
                  description: success ? "Share this link with your team members" : "Failed to copy link",
                  variant: success ? "default" : "destructive"
                });
              }}>
                    <Share2 className="h-4 w-4 mr-2" />
                    Share with Team
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>}
          {consult?.status === "finalized" && visitType !== 'procedure' && <>
              <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
                <DialogTrigger asChild>
                  
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Email Treatment Plan</DialogTitle>
                    <DialogDescription>
                      Send the treatment plan to the patient owner's email or another address.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    {!showPreview ? <>
                        <div className="space-y-2">
                          <Label htmlFor="email">Recipient Email</Label>
                          <Input id="email" type="email" placeholder="owner@example.com" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} />
                        </div>
                        <Button onClick={generateEmailPreview} disabled={!recipientEmail} className="w-full">
                          Preview Email
                        </Button>
                      </> : <>
                        <div className="space-y-2">
                          <Label htmlFor="emailPreview">Email Content (editable)</Label>
                          <Textarea id="emailPreview" value={emailPreview} onChange={e => setEmailPreview(e.target.value)} rows={15} className="font-mono text-sm" />
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" onClick={() => setShowPreview(false)} className="flex-1">
                            Back
                          </Button>
                          <Button onClick={sendTreatmentPlanEmail} disabled={sendingEmail} className="flex-1">
                            {sendingEmail ? "Sending..." : "Send Email"}
                          </Button>
                        </div>
                      </>}
                  </div>
                </DialogContent>
              </Dialog>
              <Button size="sm" variant="outline" className="h-8 px-2" onClick={exportTreatmentPlan}>
                <Download className="h-3 w-3 sm:mr-1" />
                <span className="hidden sm:inline">Export</span>
              </Button>
            </>}
          {permissions.isReceptionist ? consult?.status !== "finalized" && <div className="h-8 px-3 py-1.5 bg-warning/10 border border-warning/20 rounded-md flex items-center">
                <span className="text-xs font-medium text-warning">DRAFT</span>
              </div> : <Button onClick={finalizeConsult} disabled={!hasMessages || consult?.status === "finalized"} size="sm" variant={consult?.status === "finalized" ? "secondary" : "default"} className="h-8 px-3">
              <Check className="h-3 w-3 sm:mr-1" />
              <span className="hidden sm:inline">{consult?.status === "finalized" ? "FINAL" : "Finalize"}</span>
            </Button>}
        </div>
      </div>

      {/* Alerts (if any) */}
      {patient?.alerts && <div className="px-4 py-2 bg-destructive/10 border-b border-destructive/20">
          <span className="text-destructive text-xs font-medium">⚠️ {patient.alerts}</span>
        </div>}

      {/* Presenting Complaint Only */}
      {consult?.reason_for_visit && visitType !== 'procedure' && (
        <Collapsible open={showPresentingComplaint} onOpenChange={setShowPresentingComplaint} className="border-b">
          <CollapsibleTrigger className="w-full px-4 py-2.5 bg-gradient-to-r from-muted/40 to-muted/20 hover:from-muted/50 hover:to-muted/30 transition-colors flex items-center gap-2 group">
            {showPresentingComplaint ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            )}
            <p className="text-sm leading-relaxed flex-1 text-left">
              <span className="font-semibold text-foreground">
                Presenting Complaint:
              </span>
              <span className="text-foreground/90"> {formatPresentingComplaint(consult.reason_for_visit)}</span>
            </p>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 py-2.5">
              {/* Vitals Display for draft consultations */}
              {consult?.status === 'draft' && currentConsultId && <VitalsDisplay vitals={{
            weight_kg: (consult as any).weight_kg,
            weight_lb: (consult as any).weight_lb,
            vitals_temperature_f: (consult as any).vitals_temperature_f,
            vitals_heart_rate: (consult as any).vitals_heart_rate,
            vitals_respiratory_rate: (consult as any).vitals_respiratory_rate,
            vitals_body_condition_score: (consult as any).vitals_body_condition_score,
            vitals_dehydration_percent: (consult as any).vitals_dehydration_percent,
            vitals_pain_score: (consult as any).vitals_pain_score,
            vitals_crt: (consult as any).vitals_crt,
            vitals_mucous_membranes: (consult as any).vitals_mucous_membranes,
            vitals_attitude: (consult as any).vitals_attitude
          }} consultId={currentConsultId} clinicId={clinicId} onVitalsUpdated={() => {
            // Refresh consult data
            if (currentConsultId) {
              supabase.from('consults').select('*').eq('id', currentConsultId).single().then(({
                data
              }) => {
                if (data) setConsult(data as any);
              });
            }
          }} />}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Case History Panel */}
      {showCaseHistory && currentConsultId && (
        <Collapsible open={showCaseHistory} onOpenChange={setShowCaseHistory} className="border-b">
          <CollapsibleTrigger className="w-full px-4 py-2.5 bg-gradient-to-r from-muted/40 to-muted/20 hover:from-muted/50 hover:to-muted/30 transition-colors flex items-center gap-2 group">
            {showCaseHistory ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            )}
            <History className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">Case History</span>
            {(consult as any)?.version && (
              <Badge variant="secondary" className="ml-auto">
                Version {(consult as any).version}
              </Badge>
            )}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 py-3">
              <CaseHistoryPanel consultId={currentConsultId} currentVersion={(consult as any)?.version} />
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Procedure Details Panel - Show when visit type is procedure */}
      {visitType === 'procedure' && currentConsultId && <div className="px-4 py-3 border-b">
          <ProcedureDetailsPanel consultId={currentConsultId} procedureName={(consult as any)?.procedure_name} procedureIndication={(consult as any)?.procedure_indication} procedureDateTime={(consult as any)?.procedure_date_time} isFinalized={consult?.status === "finalized"} canEdit={permissions.canEditClinicalData} />
        </div>}

      <div className="flex-1 overflow-hidden">
        <ChatInterface consultId={currentConsultId} patientId={patientId} useHistory={false} className="h-full" clinicId={clinicId} consult={consult} visitType={visitType} onCopyNotes={copyLatestNotes} onCopyEmail={copyClientEmail} onConsultCreated={handleConsultCreated} onMessageSent={updateMessageCount} inputMode={inputMode} />
      </div>

      {/* Unfinalize Confirmation Dialog */}
      <Dialog open={unfinalizeDialogOpen} onOpenChange={setUnfinalizeDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Unfinalize this consultation?</DialogTitle>
            <DialogDescription className="space-y-3 pt-2">
              <p>
                This will return the case to <strong>Draft</strong> so you can edit it. The AI will
                re-generate the SOAP, procedure notes, wellness/vaccine summary, and client email after you
                submit your update.
              </p>
              <p className="text-xs text-muted-foreground">
                Previous exports remain archived in Case History. A new version will be created. All subsequent
                exports/emails will reflect the updated content.
              </p>
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="outline" onClick={() => setUnfinalizeDialogOpen(false)} disabled={isUnfinalizing}>
              Cancel
            </Button>
            <Button onClick={unfinalizeConsult} disabled={isUnfinalizing}>
              {isUnfinalizing ? "Unfinalizing..." : "Unfinalize"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Copy Fallback Dialog for Mobile */}
      <CopyFallbackDialog
        open={showCopyDialog}
        onOpenChange={setShowCopyDialog}
        title={copyDialogTitle}
        text={copyDialogText}
      />
    </div>;
}