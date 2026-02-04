import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, FileText, AlertTriangle, Stethoscope, ClipboardList, Heart, Scissors } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { ClinicalSummaryBullets } from "./ClinicalSummaryBullets";

interface Consult {
  id: string;
  created_at: string;
  reason_for_visit?: string | null;
  visit_type?: string | null;
  status?: string | null;
  history_summary?: string | null;
  // SOAP fields
  soap_s?: string | null;
  soap_o?: string | null;
  soap_a?: string | null;
  soap_p?: string | null;
  // Other fields
  discharge_summary?: string | null;
  case_notes?: string | null;
  procedure_name?: string | null;
  procedure_indication?: string | null;
}

interface SummaryItem {
  consultId: string;
  date: Date;
  type: 'medical_history' | 'visit';
  visitType?: 'wellness' | 'procedure' | 'soap' | 'euthanasia';
  title: string;
  fallbackBullets: string[];
  clinicalSummary?: string | null;
  isEuthanasia?: boolean;
}

interface PatientCaseSummaryProps {
  consults: Consult[];
}

// ========== VISIT TYPE DETECTION ==========

function getVisitType(consult: Consult): 'wellness' | 'procedure' | 'soap' | 'medical_history' | 'euthanasia' {
  const isEuthanasia = consult.visit_type === 'euthanasia' || 
    consult.reason_for_visit?.toLowerCase().includes('euthanasia') ||
    consult.reason_for_visit?.toLowerCase().includes('humane end');
  if (isEuthanasia) return 'euthanasia';

  if (consult.case_notes) {
    try {
      const parsed = JSON.parse(consult.case_notes);
      if (parsed.imported_medical_history) return 'medical_history';
      if (parsed.wellness) return 'wellness';
      if (parsed.procedure) return 'procedure';
    } catch {
      // Not JSON
    }
  }

  if (consult.visit_type === 'wellness') return 'wellness';
  if (consult.visit_type === 'procedure') return 'procedure';
  
  return 'soap';
}

// ========== FALLBACK EXTRACTION (used when AI unavailable) ==========

function cleanBullet(line: string): string {
  return line
    .replace(/^[\d]+\.\s*/, '')
    .replace(/^[-•*]\s*/, '')
    .replace(/^\*\*.*?\*\*:?\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/\[\[([^\]]+)\]\]/g, '$1') // Strip template markers
    .trim();
}

function extractFirstMeaningfulLine(text: string, maxLength = 60): string | null {
  if (!text) return null;
  const lines = text.split('\n').filter(l => l.trim());
  for (const line of lines) {
    const cleaned = cleanBullet(line);
    if (cleaned.length > 5 && !cleaned.endsWith(':')) {
      return cleaned.length > maxLength ? cleaned.substring(0, maxLength - 3) + '...' : cleaned;
    }
  }
  return null;
}

function extractFallbackBullets(consult: Consult, visitType: string): string[] {
  const bullets: string[] = [];

  if (consult.reason_for_visit) {
    const cc = consult.reason_for_visit.substring(0, 50);
    bullets.push(`CC: ${cc}`);
  }

  if (consult.soap_a) {
    const dx = extractFirstMeaningfulLine(consult.soap_a, 50);
    if (dx) bullets.push(`Dx: ${dx}`);
  }

  if (consult.soap_p) {
    const tx = extractFirstMeaningfulLine(consult.soap_p, 50);
    if (tx) bullets.push(`Tx: ${tx}`);
  }

  return bullets.length > 0 ? bullets : ['No summary available'];
}

// ========== MAIN COMPONENT ==========

export function PatientCaseSummary({ consults }: PatientCaseSummaryProps) {
  const [isOpen, setIsOpen] = useState(false);

  const summaryItems = useMemo(() => {
    const items: SummaryItem[] = [];
    let medicalHistoryData: { summary?: string; diagnoses: string[]; allergies: string[] } | null = null;

    const sortedConsults = [...consults].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    for (const consult of sortedConsults) {
      const visitType = getVisitType(consult);

      // Handle medical history import
      if (visitType === 'medical_history' && consult.case_notes) {
        try {
          const parsed = JSON.parse(consult.case_notes);
          const history = parsed.imported_medical_history;
          medicalHistoryData = {
            summary: history.summary_narrative || history.summary,
            diagnoses: [],
            allergies: []
          };

          const diagnosesArray = history.past_diagnoses || history.diagnoses;
          if (diagnosesArray && Array.isArray(diagnosesArray)) {
            diagnosesArray.forEach((d: any) => {
              if (typeof d === 'string') {
                medicalHistoryData!.diagnoses.push(d);
              } else if (d.diagnosis || d.name) {
                medicalHistoryData!.diagnoses.push(d.diagnosis || d.name);
              }
            });
          }

          if (history.allergies && Array.isArray(history.allergies)) {
            history.allergies.forEach((a: any) => {
              if (typeof a === 'string') {
                medicalHistoryData!.allergies.push(a);
              } else if (a.allergen) {
                medicalHistoryData!.allergies.push(a.allergen);
              }
            });
          }
          continue;
        } catch {
          // Continue
        }
      }

      // Generate fallback bullets for non-AI display
      const fallbackBullets = extractFallbackBullets(consult, visitType);

      items.push({
        consultId: consult.id,
        date: new Date(consult.created_at),
        type: 'visit',
        visitType: visitType === 'medical_history' ? 'soap' : visitType,
        title: format(new Date(consult.created_at), "MMM d, yyyy").toUpperCase(),
        fallbackBullets,
        clinicalSummary: consult.history_summary,
        isEuthanasia: visitType === 'euthanasia'
      });
    }

    return { items, medicalHistoryData };
  }, [consults]);

  const { items, medicalHistoryData } = summaryItems;
  const hasContent = items.length > 0 || medicalHistoryData;

  if (!hasContent) {
    return null;
  }

  const hasAllergies = medicalHistoryData?.allergies && 
    medicalHistoryData.allergies.length > 0 && 
    !medicalHistoryData.allergies.some(a => 
      a.toLowerCase().includes('nkda') || 
      a.toLowerCase() === 'none' ||
      a.toLowerCase() === 'n/a'
    );

  const getVisitTypeDisplay = (visitType?: string) => {
    switch (visitType) {
      case 'wellness':
        return { icon: Heart, label: 'Wellness', className: 'text-green-600 dark:text-green-400' };
      case 'procedure':
        return { icon: Scissors, label: 'Procedure', className: 'text-blue-600 dark:text-blue-400' };
      case 'euthanasia':
        return { icon: Stethoscope, label: null, className: 'text-muted-foreground' };
      default:
        return { icon: Stethoscope, label: 'Visit', className: 'text-muted-foreground' };
    }
  };

  return (
    <div className="pt-6 border-t border-border space-y-4">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex items-center justify-between w-full group">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <div className="text-left">
              <h3 className="text-lg md:text-xl font-semibold text-foreground">
                Patient Summary
              </h3>
              <p className="text-xs md:text-sm text-muted-foreground">
                {items.length} visit{items.length !== 1 ? 's' : ''} recorded
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground group-hover:text-foreground transition-colors">
            {hasAllergies && (
              <span className="flex items-center gap-1 text-xs text-destructive font-medium">
                <AlertTriangle className="h-3 w-3" />
                Allergies
              </span>
            )}
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="mt-3 space-y-4 pl-6 border-l-2 border-muted">
            {/* Medical History Section */}
            {medicalHistoryData && (
              <div className="relative">
                <div className="absolute -left-[25px] top-0 w-3 h-3 rounded-full bg-primary/20 border-2 border-primary" />
                <div className="pb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <ClipboardList className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold text-primary uppercase tracking-wide">
                      Medical History
                    </span>
                  </div>
                  <div className="space-y-1 text-sm">
                    {medicalHistoryData.diagnoses.length > 0 && (
                      <div className="flex items-start gap-2">
                        <span className="text-muted-foreground">•</span>
                        <span>
                          <span className="text-muted-foreground font-medium">Hx: </span>
                          <span className="text-foreground">{medicalHistoryData.diagnoses.join(', ')}</span>
                        </span>
                      </div>
                    )}
                    {medicalHistoryData.allergies.length > 0 && (
                      <div className="flex items-start gap-2">
                        <span className="text-muted-foreground">•</span>
                        <span>
                          <span className={`font-medium ${hasAllergies ? 'text-destructive' : 'text-muted-foreground'}`}>
                            Allergies: 
                          </span>
                          <span className={hasAllergies ? 'text-destructive' : 'text-foreground'}>
                            {' '}{medicalHistoryData.allergies.join(', ')}
                          </span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Visit Items - AI Powered */}
            {items.map((item, index) => {
              const typeDisplay = getVisitTypeDisplay(item.visitType);
              const Icon = typeDisplay.icon;

              return (
                <div key={item.consultId} className="relative">
                  <div className={`absolute -left-[25px] top-0 w-3 h-3 rounded-full ${
                    item.isEuthanasia 
                      ? 'bg-muted border-2 border-muted-foreground' 
                      : 'bg-background border-2 border-muted-foreground/50'
                  }`} />
                  <div className="pb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className={`h-4 w-4 ${typeDisplay.className}`} />
                      <span className="text-xs font-semibold text-muted-foreground">
                        {item.title}
                      </span>
                    </div>

                    {/* AI-powered summary with fallback */}
                    <ClinicalSummaryBullets
                      consultId={item.consultId}
                      existingSummary={item.clinicalSummary}
                      fallbackBullets={item.fallbackBullets}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
