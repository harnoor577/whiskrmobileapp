import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";
import { MedicalHistoryDisplay } from "./MedicalHistoryDisplay";

interface Consult {
  created_at: string;
  reason_for_visit?: string | null;
  soap_a?: string | null;
  soap_p?: string | null;
  original_input?: string | null;
  discharge_summary?: string | null;
  case_notes?: string | null;
}

interface PatientSummaryCardProps {
  consults: Consult[];
}

export function PatientSummaryCard({ consults }: PatientSummaryCardProps) {
  // Find the most recent medical history import
  const getMedicalHistoryConsult = () => {
    for (const consult of consults) {
      if (consult.case_notes) {
        try {
          const parsed = JSON.parse(consult.case_notes);
          if (parsed.imported_medical_history) {
            return consult;
          }
        } catch {
          // Not JSON, continue
        }
      }
    }
    return null;
  };

  const medicalHistoryConsult = getMedicalHistoryConsult();

  return (
    <Card className="border-border/50 shadow-sm">
      <CardContent className="p-4 md:p-6">
        <div className="space-y-4">
          {/* Medical History Section */}
          <div>
            <h3 className="text-lg md:text-xl font-bold text-foreground mb-2">
              Medical History
            </h3>
            <MedicalHistoryDisplay caseNotes={medicalHistoryConsult?.case_notes} />
          </div>
          
          {/* Latest Visit Section */}
          <div className="pt-4 border-t border-border/50">
            <h4 className="text-sm font-semibold text-foreground mb-2">Latest Visit</h4>
            {consults.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                {format(new Date(consults[0].created_at), "MMMM d, yyyy 'at' h:mm a")}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">No visits recorded</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
