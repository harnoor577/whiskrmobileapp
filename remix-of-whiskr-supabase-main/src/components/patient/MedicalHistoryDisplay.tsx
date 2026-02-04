import { useState } from "react";
import { ChevronDown, ChevronUp, ClipboardList } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ClinicalSummaryBullets } from "./ClinicalSummaryBullets";

interface MedicalHistoryDisplayProps {
  caseNotes?: string | null;
  consultId?: string;
  clinicalSummary?: string | null;
}

interface ParsedMedicalHistory {
  summary: string | null;
  diagnoses: string[];
  allergies: string[];
}

export function MedicalHistoryDisplay({ caseNotes, consultId, clinicalSummary }: MedicalHistoryDisplayProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Parse medical history from case_notes JSON
  const parseMedicalHistory = (): ParsedMedicalHistory => {
    if (!caseNotes) return { summary: null, diagnoses: [], allergies: [] };

    try {
      const parsed = JSON.parse(caseNotes);
      const history = parsed.imported_medical_history;
      
      if (!history) return { summary: null, diagnoses: [], allergies: [] };

      let summary: string | null = null;
      const diagnoses: string[] = [];
      const allergies: string[] = [];

      // Extract summary (check both field names)
      const summaryText = history.summary_narrative || history.summary;
      if (summaryText) {
        summary = summaryText;
      }

      // Extract diagnoses (check both field names)
      const diagnosesArray = history.past_diagnoses || history.diagnoses;
      if (diagnosesArray && Array.isArray(diagnosesArray)) {
        diagnosesArray.forEach((d: any) => {
          if (typeof d === 'string') {
            diagnoses.push(d);
          } else if (d.diagnosis || d.name) {
            diagnoses.push(d.diagnosis || d.name);
          }
        });
      }

      // Extract allergies
      if (history.allergies && Array.isArray(history.allergies)) {
        history.allergies.forEach((a: any) => {
          if (typeof a === 'string') {
            allergies.push(a);
          } else if (a.allergen) {
            allergies.push(a.allergen);
          }
        });
      }

      return { summary, diagnoses, allergies };
    } catch {
      return { summary: null, diagnoses: [], allergies: [] };
    }
  };

  const history = parseMedicalHistory();
  const hasContent = history.summary || history.diagnoses.length > 0 || history.allergies.length > 0;

  if (!hasContent) {
    return (
      <p className="text-xs text-muted-foreground italic">No medical history on record</p>
    );
  }

  // Create fallback bullets from parsed data
  const extractFallbackBullets = (): string[] => {
    const bullets: string[] = [];
    
    if (history.summary) {
      // Extract first sentence or first 100 chars
      const firstSentence = history.summary.split(/[.!?]/)[0]?.trim();
      if (firstSentence) {
        bullets.push(`Presenting: ${firstSentence.slice(0, 80)}${firstSentence.length > 80 ? '...' : ''}`);
      }
    }
    
    if (history.diagnoses.length > 0) {
      bullets.push(`Hx: ${history.diagnoses.slice(0, 3).join(', ')}${history.diagnoses.length > 3 ? '...' : ''}`);
    }
    
    const hasAllergies = history.allergies.length > 0 && 
      !history.allergies.some(a => a.toLowerCase().includes('nkda') || a.toLowerCase().includes('none'));
    bullets.push(`Allergies: ${hasAllergies ? history.allergies.join(', ') : 'NKDA'}`);
    
    return bullets;
  };

  const hasAllergies = history.allergies.length > 0 && 
    !history.allergies.some(a => a.toLowerCase().includes('nkda') || a.toLowerCase().includes('none'));

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
        <ClipboardList className="h-3 w-3" />
        <span>Medical History</span>
        {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 p-3 bg-muted/30 rounded-md">
          {consultId ? (
            <ClinicalSummaryBullets
              consultId={consultId}
              existingSummary={clinicalSummary}
              fallbackBullets={extractFallbackBullets()}
            />
          ) : (
            <div className="space-y-2">
              {history.summary && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Summary</p>
                  <p className="text-xs text-foreground">{history.summary}</p>
                </div>
              )}
              
              {history.diagnoses.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Past Diagnoses</p>
                  <ul className="text-xs text-foreground space-y-0.5 mt-0.5">
                    {history.diagnoses.map((dx, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-muted-foreground mt-0.5 text-[8px]">•</span>
                        <span>{dx}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Allergies</p>
                <p className={`text-xs ${hasAllergies ? 'text-destructive font-medium' : 'text-foreground'}`}>
                  {hasAllergies ? `⚠ ${history.allergies.join(', ')}` : 'None known (NKDA)'}
                </p>
              </div>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
