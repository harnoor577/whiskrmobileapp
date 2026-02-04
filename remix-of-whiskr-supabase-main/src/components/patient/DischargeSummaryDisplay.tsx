import { useState } from "react";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ClinicalSummaryBullets } from "./ClinicalSummaryBullets";

interface DischargeSummaryDisplayProps {
  dischargeSummary?: string | null;
  consultId?: string;
  clinicalSummary?: string | null;
}

export function DischargeSummaryDisplay({ 
  dischargeSummary, 
  consultId,
  clinicalSummary 
}: DischargeSummaryDisplayProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Extract fallback bullet points from discharge summary (used when AI unavailable)
  const extractFallbackBullets = (): string[] => {
    if (!dischargeSummary) return [];

    const bullets: string[] = [];
    const text = dischargeSummary;

    // Extract diagnosis
    const diagnosisMatch = text.match(/(?:Provisional Diagnosis|Primary Diagnosis|Diagnosis|Assessment|Condition)[:\s]+([^.\n]+)/i);
    if (diagnosisMatch) {
      bullets.push(`Dx: ${diagnosisMatch[1].trim().substring(0, 80)}`);
    }

    // Extract key findings (limit to 2)
    const keyFindingsSection = text.match(/(?:KEY FINDINGS|FINDINGS|Clinical Findings)[:\s]*([\s\S]*?)(?=\n\n|TREATMENT|PLAN|RECOMMENDATIONS|$)/i);
    if (keyFindingsSection) {
      const bulletPoints = keyFindingsSection[1].match(/[•\-\*]\s*([^\n•\-\*]+)/g);
      if (bulletPoints) {
        bulletPoints.slice(0, 2).forEach(point => {
          const cleaned = point.replace(/^[•\-\*]\s*/, '').trim();
          if (cleaned.length > 5) bullets.push(cleaned.substring(0, 60));
        });
      }
    }

    // Extract treatment highlights (limit to 2)
    const treatmentSection = text.match(/(?:TREATMENT|PLAN|Medications|Therapy)[:\s]*([\s\S]*?)(?=\n\n|FOLLOW|NEXT|$)/i);
    if (treatmentSection) {
      const bulletPoints = treatmentSection[1].match(/[•\-\*]\s*([^\n•\-\*]+)/g);
      if (bulletPoints) {
        bulletPoints.slice(0, 2).forEach(point => {
          const cleaned = point.replace(/^[•\-\*]\s*/, '').trim();
          if (cleaned.length > 5) bullets.push(`Tx: ${cleaned.substring(0, 60)}`);
        });
      }
    }

    // If no structured data found, try to get first few sentences
    if (bullets.length === 0) {
      const sentences = text.split(/[.\n]/).filter(s => s.trim().length > 10);
      sentences.slice(0, 3).forEach(s => {
        bullets.push(s.trim().substring(0, 60));
      });
    }

    return bullets;
  };

  const fallbackBullets = extractFallbackBullets();
  const hasContent = consultId || fallbackBullets.length > 0;

  if (!hasContent) {
    return (
      <p className="text-xs text-muted-foreground italic">No summary available</p>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
        <FileText className="h-3 w-3" />
        <span>Summary</span>
        {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 p-3 bg-muted/30 rounded-md">
          {consultId ? (
            <ClinicalSummaryBullets 
              consultId={consultId}
              existingSummary={clinicalSummary}
              fallbackBullets={fallbackBullets}
            />
          ) : (
            <ul className="text-xs text-foreground space-y-1">
              {fallbackBullets.map((bullet, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-muted-foreground mt-1 text-[8px]">•</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
