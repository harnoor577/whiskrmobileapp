import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, FileText } from "lucide-react";

interface TypeDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  onSubmit: (formData: ConsultFormData) => void;
  onBack: () => void;
  isLoading?: boolean;
}

export interface ConsultFormData {
  patientIdentification: string;
  presentingComplaint: string;
  vitals: string;
  physicalExamination: string;
  diagnostics: string;
  ownerConstraints: string;
}

export function TypeDetailsDialog({
  open,
  onOpenChange,
  patientId,
  onSubmit,
  onBack,
  isLoading = false,
}: TypeDetailsDialogProps) {
  const [details, setDetails] = useState("");
  const [touched, setTouched] = useState(false);

  const isFormValid = details.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isFormValid) {
      // Parse the single textarea into the expected format
      // The entire content goes as original_input, we'll let the AI parse it
      const formData: ConsultFormData = {
        patientIdentification: "",
        presentingComplaint: "",
        vitals: "",
        physicalExamination: "",
        diagnostics: "",
        ownerConstraints: "",
      };
      
      // Store the raw details - the backend will parse this
      // We'll pass it through presentingComplaint as that's the main content field
      formData.presentingComplaint = details.trim();
      
      onSubmit(formData);
    } else {
      setTouched(true);
    }
  };

  const error = touched && !isFormValid ? "Please enter consultation details" : null;

  const placeholderText = `Max, 5-year-old male Golden Retriever. Presenting for vomiting x 2 days. Vitals: T 102.5°F, HR 100, RR 24. On exam: Mild dehydration, tense abdomen. Blood work pending. Owner prefers conservative treatment if possible.`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="h-8 w-8 shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <div>
                <h2 className="text-lg font-semibold">Patient ID: {patientId}</h2>
                <p className="text-sm text-muted-foreground">
                  Type the consultation details below
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Instructions Section */}
        <div className="p-4 sm:p-5 bg-card border-b">
          <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Instructions for Best Results
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            For optimal results, please include the following details:{' '}
            <span className="text-primary font-medium">Presenting Complaint</span>,{' '}
            <span className="text-primary font-medium">Vitals</span>,{' '}
            <span className="text-primary font-medium">Physical Examination</span>,{' '}
            <span className="text-primary font-medium">Diagnostics</span>, and{' '}
            <span className="text-primary font-medium">Owner's Constraints</span>.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-2 animate-fade-in">
            <Label htmlFor="details" className="text-sm font-medium">
              Consultation Details
            </Label>
            <Textarea
              id="details"
              placeholder={placeholderText}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              onBlur={() => setTouched(true)}
              rows={14}
              className={`resize-none ${error ? "border-destructive" : ""}`}
            />
            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full mt-6"
            disabled={!isFormValid || isLoading}
          >
            {isLoading ? "Submitting..." : "Submit Details"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
