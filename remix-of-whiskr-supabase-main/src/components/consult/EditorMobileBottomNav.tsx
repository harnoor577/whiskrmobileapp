import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stethoscope, Eye, Mic, Upload, RefreshCw, Pencil } from 'lucide-react';
import { useHaptic } from '@/hooks/use-haptic';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { PatientInfoCard } from '@/components/patient/PatientInfoCard';
import { EditPatientBasicDialog } from '@/components/consult/EditPatientBasicDialog';

interface PatientInfo {
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
}

type ReportType = 'soap' | 'wellness' | 'procedure';

interface EditorMobileBottomNavProps {
  patientInfo: PatientInfo | null;
  consultId: string;
  currentReportType: ReportType;
  onViewInput: () => void;
  onRecord: () => void;
  onUploadDiagnostics: () => void;
  onPatientUpdated?: () => void;
  weightUnit?: 'kg' | 'lb';
}

const reportTypeLabels: Record<ReportType, string> = {
  soap: 'SOAP Notes',
  wellness: 'Wellness Exam',
  procedure: 'Procedure Notes',
};

/**
 * Editor-specific mobile bottom navigation bar with 5 buttons:
 * - Patient Info (opens sheet)
 * - View/Edit Input
 * - Record (center FAB)
 * - Upload Diagnostics
 * - Switch Report Type
 */
export const EditorMobileBottomNav = ({
  patientInfo,
  consultId,
  currentReportType,
  onViewInput,
  onRecord,
  onUploadDiagnostics,
  onPatientUpdated,
  weightUnit = 'kg',
}: EditorMobileBottomNavProps) => {
  const { triggerHaptic } = useHaptic();
  const navigate = useNavigate();
  const [showPatientSheet, setShowPatientSheet] = useState(false);
  const [showSwitchSheet, setShowSwitchSheet] = useState(false);
  const [showEditPatient, setShowEditPatient] = useState(false);

  const handleNavClick = (action: () => void) => {
    triggerHaptic('light');
    action();
  };

  const handleRecordClick = () => {
    triggerHaptic('success');
    onRecord();
  };

  const handleSwitchReportType = (newType: ReportType) => {
    if (newType === currentReportType) {
      setShowSwitchSheet(false);
      return;
    }
    
    triggerHaptic('light');
    setShowSwitchSheet(false);
    
    // Navigate to the new editor with regeneration flag
    const editorRoutes: Record<ReportType, string> = {
      soap: `/soap-editor/${consultId}`,
      wellness: `/wellness-editor/${consultId}`,
      procedure: `/procedure-editor/${consultId}`,
    };
    
    navigate(editorRoutes[newType]);
  };

  return (
    <>
      {/* Bottom Navigation Bar - Mobile Only */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50">
        {/* Background bar */}
        <div className="bg-card/95 backdrop-blur-lg border-t border-border">
          <div className="flex items-center justify-around px-2 py-3">
            {/* Patient Info */}
            <button
              onClick={() => handleNavClick(() => setShowPatientSheet(true))}
              className="flex flex-col items-center justify-center gap-1 px-2 py-1 rounded-lg transition-colors btn-touch text-muted-foreground hover:text-foreground"
            >
              <Stethoscope className="h-5 w-5" />
              <span className="text-[10px] font-medium">Patient</span>
            </button>

            {/* View/Edit Input */}
            <button
              onClick={() => handleNavClick(onViewInput)}
              className="flex flex-col items-center justify-center gap-1 px-2 py-1 rounded-lg transition-colors btn-touch text-muted-foreground hover:text-foreground"
            >
              <Eye className="h-5 w-5" />
              <span className="text-[10px] font-medium">View/Edit</span>
            </button>

            {/* Placeholder for center button space */}
            <div className="w-14" />

            {/* Upload Diagnostics */}
            <button
              onClick={() => handleNavClick(onUploadDiagnostics)}
              className="flex flex-col items-center justify-center gap-1 px-2 py-1 rounded-lg transition-colors btn-touch text-muted-foreground hover:text-foreground"
            >
              <Upload className="h-5 w-5" />
              <span className="text-[10px] font-medium">Upload Dx</span>
            </button>

            {/* Switch Report Type */}
            <button
              onClick={() => handleNavClick(() => setShowSwitchSheet(true))}
              className="flex flex-col items-center justify-center gap-1 px-2 py-1 rounded-lg transition-colors btn-touch text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="h-5 w-5" />
              <span className="text-[10px] font-medium">Switch</span>
            </button>
          </div>
          {/* Bottom Safe Area Spacer - Despia Native injects value */}
          <div style={{ height: 'var(--safe-area-bottom)' }} />
        </div>

        {/* Floating Center Button - Record */}
        <button
          onClick={handleRecordClick}
          className="absolute left-1/2 -translate-x-1/2 -top-7 flex flex-col items-center"
        >
          <div className="h-14 w-14 rounded-full bg-primary shadow-xl ring-4 ring-card/80 flex items-center justify-center transform transition-transform active:scale-95 hover:bg-primary/90">
            <Mic className="h-7 w-7 text-primary-foreground" />
          </div>
          <span className="text-[10px] mt-1 font-semibold text-primary">Record</span>
        </button>
      </nav>

      {/* Patient Info Sheet */}
      <Sheet open={showPatientSheet} onOpenChange={setShowPatientSheet}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center justify-between">
              <span>Patient Information</span>
              {patientInfo?.id && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowPatientSheet(false);
                    setShowEditPatient(true);
                  }}
                >
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              )}
            </SheetTitle>
          </SheetHeader>
          <div className="py-4">
            {patientInfo ? (
              <PatientInfoCard
                patient={{
                  name: patientInfo.name,
                  species: patientInfo.species,
                  breed: patientInfo.breed,
                  sex: patientInfo.sex,
                  age: patientInfo.age,
                  date_of_birth: patientInfo.dateOfBirth,
                  weight_kg: patientInfo.weightKg,
                  weight_lb: patientInfo.weightLb,
                  identifiers: { patient_id: patientInfo.patientId },
                }}
                weightUnit={weightUnit}
              />
            ) : (
              <p className="text-muted-foreground text-center py-8">
                No patient information available
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Switch Report Type Sheet */}
      <Sheet open={showSwitchSheet} onOpenChange={setShowSwitchSheet}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle>Switch Report Type</SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-2">
            {(Object.keys(reportTypeLabels) as ReportType[]).map((type) => (
              <button
                key={type}
                onClick={() => handleSwitchReportType(type)}
                className={cn(
                  "w-full flex items-center justify-between px-4 py-3 rounded-lg transition-colors",
                  type === currentReportType
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/80 text-foreground"
                )}
              >
                <span className="font-medium">{reportTypeLabels[type]}</span>
                {type === currentReportType && (
                  <span className="text-xs bg-primary-foreground/20 px-2 py-0.5 rounded">
                    Current
                  </span>
                )}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit Patient Dialog */}
      {patientInfo?.id && (
        <EditPatientBasicDialog
          open={showEditPatient}
          onOpenChange={setShowEditPatient}
          patient={{
            id: patientInfo.id,
            name: patientInfo.name,
            species: patientInfo.species,
            breed: patientInfo.breed,
            sex: patientInfo.sex,
            age: patientInfo.age,
            identifiers: { patient_id: patientInfo.patientId },
          }}
          onPatientUpdated={() => {
            setShowEditPatient(false);
            onPatientUpdated?.();
          }}
        />
      )}
    </>
  );
};
