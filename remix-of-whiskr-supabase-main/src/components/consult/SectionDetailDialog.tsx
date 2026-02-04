import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Download, Copy, Check } from 'lucide-react';
import { format } from 'date-fns';
import { ReactNode } from 'react';
import { copyToClipboard, isIOS } from '@/utils/clipboard';
import { CopyFallbackDialog } from '@/components/ui/CopyFallbackDialog';
import { toast } from 'sonner';
import {
  createPDFContext,
  addDocumentTitle,
  addHeaderWithPatientAndClinic,
  addSection,
  addBodyText,
  addPageFooters,
  ClinicInfo,
  VetInfo,
  PatientInfoPDF,
} from '@/utils/pdfExport';

interface PatientInfo {
  name: string;
  species: string;
  breed: string | null;
}

interface SectionDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  icon: ReactNode;
  patient?: PatientInfo | null;
  consultDate?: string;
  children: ReactNode;
  exportData?: {
    type: 'original' | 'soap' | 'wellness' | 'procedure' | 'education' | 'discharge';
    content: Record<string, string | null> | string | null;
  };
  copyAllContent?: string;
  extraFooterContent?: ReactNode;
  clinic?: ClinicInfo | null;
  vet?: VetInfo | null;
}

export function SectionDetailDialog({
  open,
  onOpenChange,
  title,
  icon,
  patient,
  consultDate,
  children,
  exportData,
  copyAllContent,
  extraFooterContent,
  clinic,
  vet,
}: SectionDetailDialogProps) {
  const [copied, setCopied] = useState(false);
  const [showFallback, setShowFallback] = useState(false);

  const handleCopyAll = async () => {
    if (!copyAllContent) return;

    if (isIOS()) {
      setShowFallback(true);
      return;
    }

    const success = await copyToClipboard(copyAllContent);
    if (success) {
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } else {
      setShowFallback(true);
    }
  };

  const handleExportPDF = () => {
    if (!exportData) return;

    let ctx = createPDFContext();

    // Add document title first
    ctx = addDocumentTitle(ctx, title);

    // Convert patient to PDF format
    const patientPDF: PatientInfoPDF | null = patient ? {
      name: patient.name,
      species: patient.species,
      breed: patient.breed,
    } : null;

    // Add side-by-side header with patient (left) and clinic/vet (right)
    ctx = addHeaderWithPatientAndClinic(ctx, patientPDF, consultDate, clinic || null, vet || null);

    // Add content based on type
    if (exportData.type === 'discharge' && typeof exportData.content === 'string') {
      // Output discharge content directly without a section heading
      ctx = addBodyText(ctx, exportData.content);
    } else if (exportData.type === 'original' && typeof exportData.content === 'string') {
      ctx = addSection(ctx, 'Original Input', exportData.content);
    } else if (exportData.type === 'soap' && typeof exportData.content === 'object' && exportData.content) {
      ctx = addSection(ctx, 'Subjective', exportData.content.soap_s ?? null);
      ctx = addSection(ctx, 'Objective', exportData.content.soap_o ?? null);
      ctx = addSection(ctx, 'Assessment', exportData.content.soap_a ?? null);
      ctx = addSection(ctx, 'Plan', exportData.content.soap_p ?? null);
    } else if ((exportData.type === 'wellness' || exportData.type === 'procedure') && typeof exportData.content === 'object' && exportData.content) {
      for (const [key, value] of Object.entries(exportData.content)) {
        if (value) {
          const heading = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          const textValue = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
          ctx = addSection(ctx, heading, textValue);
        }
      }
    } else if (exportData.type === 'education' && typeof exportData.content === 'object' && exportData.content) {
      const educationHeadings: Record<string, string> = {
        whatIsCondition: 'What Is This Condition?',
        causesRisk: 'Causes and Risk Factors',
        understandingTreatment: 'Understanding the Treatment',
        recovery: 'What to Expect During Recovery',
        homeCare: 'Home Care Tips',
        prevention: 'Prevention and Long-Term Care',
        whenToContact: 'When to Contact Your Veterinarian',
      };
      
      for (const [key, value] of Object.entries(exportData.content)) {
        if (value) {
          const heading = educationHeadings[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          const textValue = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
          ctx = addSection(ctx, heading, textValue);
        }
      }
    }

    // Add page footers
    ctx = addPageFooters(ctx);

    const filename = `${title.replace(/\s+/g, '_')}_${patient?.name || 'consult'}_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
    ctx.doc.save(filename);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] !grid !grid-rows-[auto_1fr_auto] overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            {icon}
            {title}
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="min-h-0 max-h-[60vh]">
          <div className="space-y-4 py-2 pr-4">
            {children}
          </div>
        </ScrollArea>
        
        <DialogFooter className="flex-shrink-0 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {extraFooterContent}
          {copyAllContent && (
            <Button variant="outline" onClick={handleCopyAll}>
              {copied ? (
                <Check className="h-4 w-4 mr-2 text-green-600" />
              ) : (
                <Copy className="h-4 w-4 mr-2" />
              )}
              Copy All
            </Button>
          )}
          {exportData && (
            <Button onClick={handleExportPDF}>
              <Download className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
          )}
        </DialogFooter>

        <CopyFallbackDialog
          open={showFallback}
          onOpenChange={setShowFallback}
          title={`Copy ${title}`}
          text={copyAllContent || ''}
        />
      </DialogContent>
    </Dialog>
  );
}
