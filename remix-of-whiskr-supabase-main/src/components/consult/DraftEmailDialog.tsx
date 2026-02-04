import { useState, useEffect } from 'react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Mail, Send, Loader2, Paperclip, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { stripMarkdown } from '@/utils/stripMarkdown';
import { generateClientEducationPDF } from '@/utils/clientEducationPdfGenerator';
import { generateMedicationPDF, type MedicationProfile } from '@/utils/medicationPdfGenerator';
import type { ExtractedMedication } from '@/utils/medicationExtractor';
import type { ClinicInfo } from '@/utils/pdfExport';
import { formatDisplayName } from '@/lib/formatDisplayName';

const emailSchema = z.object({
  to: z.string().trim().email('Please enter a valid email address'),
  subject: z.string().trim().min(1, 'Subject is required'),
  body: z.string().trim().min(1, 'Message is required'),
});

interface PatientInfo {
  name: string;
  species: string;
  breed?: string | null;
}

interface DraftEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientName: string;
  dischargeSummary: string;
  consultId: string;
  hasClientEducation: boolean;
  clientEducation?: string;
  medications: ExtractedMedication[];
  patient: PatientInfo | null;
  clinic: ClinicInfo | null;
  clinicEmail?: string;
  doctorName?: string;
  doctorPrefix?: string;
}

export function DraftEmailDialog({
  open,
  onOpenChange,
  patientName,
  dischargeSummary,
  consultId,
  hasClientEducation,
  clientEducation,
  medications,
  patient,
  clinic,
  clinicEmail,
  doctorName,
  doctorPrefix,
}: DraftEmailDialogProps) {
  // Build email body with signature
  const buildEmailBody = () => {
    const content = stripMarkdown(dischargeSummary);
    const formattedDoctor = formatDisplayName(doctorName, doctorPrefix);
    const signature = formattedDoctor 
      ? `\n\nBest regards,\n${formattedDoctor}${clinic?.name ? `\n${clinic.name}` : ''}`
      : (clinic?.name ? `\n\nBest regards,\n${clinic.name}` : '');
    return content + signature;
  };

  const [recipientEmail, setRecipientEmail] = useState('');
  const [subject, setSubject] = useState(`${patientName}'s Discharge Summary`);
  const [body, setBody] = useState(buildEmailBody());
  const [includeClientEducation, setIncludeClientEducation] = useState(false);
  const [selectedMedications, setSelectedMedications] = useState<Set<string>>(new Set());
  const [isSending, setIsSending] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [progressMessage, setProgressMessage] = useState('');

  // Reset state when dialog opens with new data
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setSubject(`${patientName}'s Discharge Summary`);
      setBody(buildEmailBody());
      setRecipientEmail('');
      setIncludeClientEducation(false);
      setSelectedMedications(new Set());
      setEmailError('');
      setProgressMessage('');
    }
    onOpenChange(newOpen);
  };

  const toggleMedication = (medName: string) => {
    setSelectedMedications(prev => {
      const newSet = new Set(prev);
      if (newSet.has(medName)) {
        newSet.delete(medName);
      } else {
        newSet.add(medName);
      }
      return newSet;
    });
  };

  const selectAllMedications = () => {
    setSelectedMedications(new Set(medications.map(m => m.name)));
  };

  const clearAllMedications = () => {
    setSelectedMedications(new Set());
  };

  const handleSendEmail = async () => {
    setEmailError('');

    // Validate email
    const validation = emailSchema.safeParse({
      to: recipientEmail,
      subject,
      body,
    });

    if (!validation.success) {
      const firstError = validation.error.errors[0];
      setEmailError(firstError.message);
      return;
    }

    setIsSending(true);
    
    try {
      const attachments: { filename: string; content: string }[] = [];

      // Generate Client Education PDF if selected
      if (includeClientEducation && clientEducation) {
        setProgressMessage('Generating Client Education PDF...');
        const educationPdf = generateClientEducationPDF(
          clientEducation,
          patient ? { name: patient.name, species: patient.species, breed: patient.breed } : null,
          clinic
        );
        const pdfBase64 = educationPdf.output('datauristring').split(',')[1];
        const safePatientName = patientName.replace(/[^a-zA-Z0-9]/g, '_');
        attachments.push({
          filename: `${safePatientName}_Client_Education.pdf`,
          content: pdfBase64,
        });
      }

      // Generate Medication PDFs for each selected medication
      const selectedMedsArray = Array.from(selectedMedications);
      for (let i = 0; i < selectedMedsArray.length; i++) {
        const medName = selectedMedsArray[i];
        setProgressMessage(`Generating medication PDF (${i + 1}/${selectedMedsArray.length}): ${medName}...`);

        try {
          // Call generate-medication-profile edge function
          const { data, error } = await supabase.functions.invoke('generate-medication-profile', {
            body: {
              drugName: medName,
              patientInfo: patient ? {
                name: patient.name,
                species: patient.species,
                breed: patient.breed,
              } : null,
            },
          });

          if (error) {
            console.error(`Error generating profile for ${medName}:`, error);
            continue; // Skip this medication but continue with others
          }

          if (data?.profile) {
            const profile = data.profile as MedicationProfile;
            const medPdf = generateMedicationPDF(
              profile,
              clinic,
              patient ? { name: patient.name, species: patient.species, breed: patient.breed } : null
            );
            const pdfBase64 = medPdf.output('datauristring').split(',')[1];
            const safeMedName = medName.replace(/[^a-zA-Z0-9]/g, '_');
            attachments.push({
              filename: `${safeMedName}_Medication_Info.pdf`,
              content: pdfBase64,
            });
          }
        } catch (err) {
          console.error(`Error generating medication PDF for ${medName}:`, err);
          // Continue with other medications
        }
      }

      setProgressMessage('Sending email...');

      const { data, error } = await supabase.functions.invoke('send-discharge-email', {
        body: {
          consultId,
          recipientEmail: recipientEmail.trim(),
          subject: subject.trim(),
          body: body.trim(),
          attachments,
        },
      });

      if (error) {
        console.error('Error sending email:', error);
        toast.error('Failed to send email. Please try again.');
        return;
      }

      if (data?.success) {
        const attachmentCount = attachments.length;
        if (attachmentCount > 0) {
          toast.success(`Email sent successfully with ${attachmentCount} PDF attachment${attachmentCount !== 1 ? 's' : ''}!`);
        } else {
          toast.success('Email sent successfully!');
        }
        onOpenChange(false);
      } else {
        toast.error(data?.error || 'Failed to send email');
      }
    } catch (err) {
      console.error('Error sending email:', err);
      toast.error('Failed to send email. Please try again.');
    } finally {
      setIsSending(false);
      setProgressMessage('');
    }
  };

  const hasMedications = medications.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Draft Email
          </DialogTitle>
          <DialogDescription>
            Compose and send the discharge summary email to the client.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* From Field */}
          <div className="space-y-2">
            <Label htmlFor="from" className="text-sm font-medium">
              From
            </Label>
            <Input
              id="from"
              value="noreply@whiskr.ai"
              disabled
              className="bg-muted text-muted-foreground"
            />
          </div>

          {/* To Field */}
          <div className="space-y-2">
            <Label htmlFor="to" className="text-sm font-medium">
              To <span className="text-destructive">*</span>
            </Label>
            <Input
              id="to"
              type="email"
              placeholder="recipient@example.com"
              value={recipientEmail}
              onChange={(e) => {
                setRecipientEmail(e.target.value);
                setEmailError('');
              }}
              className={emailError ? 'border-destructive' : ''}
              autoFocus
            />
            {emailError && (
              <p className="text-sm text-destructive">{emailError}</p>
            )}
          </div>

          {/* Subject Field */}
          <div className="space-y-2">
            <Label htmlFor="subject" className="text-sm font-medium">
              Subject <span className="text-destructive">*</span>
            </Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
            />
          </div>

          {/* Body Field */}
          <div className="space-y-2">
            <Label htmlFor="body" className="text-sm font-medium">
              Message <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-[200px] resize-none font-sans text-sm"
              placeholder="Email content..."
            />
          </div>

          {/* Attachments Section */}
          {(hasClientEducation || hasMedications) && (
            <div className="space-y-3 pt-2 border-t border-border">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Paperclip className="h-4 w-4" />
                PDF Attachments (optional)
              </div>
              
              <div className="space-y-3">
                {/* Client Education Checkbox */}
                {hasClientEducation && (
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="include-education"
                      checked={includeClientEducation}
                      onCheckedChange={(checked) => 
                        setIncludeClientEducation(checked === true)
                      }
                    />
                    <Label
                      htmlFor="include-education"
                      className="text-sm font-normal cursor-pointer flex items-center gap-2"
                    >
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      Client Education PDF
                    </Label>
                  </div>
                )}

                {/* Medication Selection */}
                {hasMedications && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-normal flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        Medication PDFs
                        {selectedMedications.size > 0 && (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                            {selectedMedications.size} selected
                          </span>
                        )}
                      </Label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={selectAllMedications}
                          className="text-xs h-7"
                        >
                          Select All
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={clearAllMedications}
                          className="text-xs h-7"
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                    
                    <ScrollArea className="h-[120px] rounded-md border border-border p-2">
                      <div className="space-y-2">
                        {medications.map((med) => (
                          <div key={med.name} className="flex items-center space-x-3">
                            <Checkbox
                              id={`med-${med.name}`}
                              checked={selectedMedications.has(med.name)}
                              onCheckedChange={() => toggleMedication(med.name)}
                            />
                            <Label
                              htmlFor={`med-${med.name}`}
                              className="text-sm font-normal cursor-pointer flex-1"
                            >
                              {med.name}
                              {med.category && (
                                <span className="text-xs text-muted-foreground ml-2">
                                  ({med.category})
                                </span>
                              )}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
            Cancel
          </Button>
          <Button onClick={handleSendEmail} disabled={isSending}>
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {progressMessage || 'Sending...'}
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send Email
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
