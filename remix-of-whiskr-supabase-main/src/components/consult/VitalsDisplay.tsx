import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Activity, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditVitalsDialog } from "./EditVitalsDialog";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/lib/auth";

interface VitalsDisplayProps {
  vitals: {
    vitals_temperature_f?: number | null;
    vitals_temperature_c?: number | null;
    vitals_heart_rate?: number | null;
    vitals_respiratory_rate?: number | null;
    vitals_body_condition_score?: string | null;
    vitals_dehydration_percent?: string | null;
    vitals_pain_score?: number | null;
    vitals_crt?: string | null;
    vitals_mucous_membranes?: string | null;
    vitals_attitude?: string | null;
    weight_kg?: number | null;
    weight_lb?: number | null;
  };
  useImperial?: boolean;
  consultId?: string;
  clinicId?: string;
  onVitalsUpdated?: () => void;
  showAddButton?: boolean;
  onAddVitals?: () => void;
}

export function VitalsDisplay({ 
  vitals, 
  useImperial = true, 
  consultId, 
  clinicId,
  onVitalsUpdated,
  showAddButton = false,
  onAddVitals
}: VitalsDisplayProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const { canEditClinicalData, isVetTech } = usePermissions();
  const { clinicId: authClinicId } = useAuth();
  
  const effectiveClinicId = clinicId || authClinicId || '';
  const canEdit = (canEditClinicalData || isVetTech) && consultId && effectiveClinicId;

  // Check if any vitals are present
  const hasVitals = Boolean(
    vitals.vitals_temperature_f ||
    vitals.vitals_temperature_c ||
    vitals.vitals_heart_rate ||
    vitals.vitals_respiratory_rate ||
    vitals.vitals_body_condition_score ||
    vitals.vitals_dehydration_percent ||
    vitals.vitals_pain_score !== null ||
    vitals.vitals_crt ||
    vitals.vitals_mucous_membranes ||
    vitals.vitals_attitude ||
    vitals.weight_kg ||
    vitals.weight_lb
  );

  if (!hasVitals) {
    if (showAddButton && onAddVitals) {
      return (
        <Button 
          variant="outline" 
          size="sm"
          onClick={onAddVitals}
          className="text-xs h-8 mt-1"
        >
          Add vitals
        </Button>
      );
    }
    return (
      <div className="text-xs text-muted-foreground italic">
        No vitals recorded
      </div>
    );
  }

  const displayTemp = useImperial 
    ? vitals.vitals_temperature_f 
      ? `${vitals.vitals_temperature_f}°F${vitals.vitals_temperature_c ? ` (${vitals.vitals_temperature_c}°C)` : ''}`
      : vitals.vitals_temperature_c ? `${vitals.vitals_temperature_c}°C` : null
    : vitals.vitals_temperature_c
      ? `${vitals.vitals_temperature_c}°C${vitals.vitals_temperature_f ? ` (${vitals.vitals_temperature_f}°F)` : ''}`
      : vitals.vitals_temperature_f ? `${vitals.vitals_temperature_f}°F` : null;

  const displayWeight = useImperial
    ? vitals.weight_lb
      ? `${vitals.weight_lb} lb${vitals.weight_kg ? ` (${vitals.weight_kg} kg)` : ''}`
      : vitals.weight_kg ? `${vitals.weight_kg} kg` : null
    : vitals.weight_kg
      ? `${vitals.weight_kg} kg${vitals.weight_lb ? ` (${vitals.weight_lb} lb)` : ''}`
      : vitals.weight_lb ? `${vitals.weight_lb} lb` : null;

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-2 w-[85%]">
        <CollapsibleTrigger className="flex items-center gap-2 text-sm hover:text-primary transition-colors">
          <Activity className="h-4 w-4" />
          <span className="font-medium">Vitals</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          {canEdit && (
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                setEditDialogOpen(true);
              }}
              className="ml-2 h-7 gap-1 px-2"
            >
              <Edit className="h-3 w-3" />
              Edit
            </Button>
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="mt-2 bg-muted/30">
            <CardContent className="pt-3 pb-3 px-3 space-y-1.5 text-xs md:text-sm">
              {displayWeight && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground flex-shrink-0">Weight:</span>
                  <span className="font-medium text-right">{displayWeight}</span>
                </div>
              )}
              {displayTemp && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground flex-shrink-0">Temperature:</span>
                  <span className="font-medium text-right">{displayTemp}</span>
                </div>
              )}
              {vitals.vitals_heart_rate && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground flex-shrink-0">Heart Rate:</span>
                  <span className="font-medium text-right">{vitals.vitals_heart_rate} bpm</span>
                </div>
              )}
              {vitals.vitals_respiratory_rate && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground flex-shrink-0">Respiratory Rate:</span>
                  <span className="font-medium text-right">{vitals.vitals_respiratory_rate} bpm</span>
                </div>
              )}
              {vitals.vitals_body_condition_score && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground flex-shrink-0">Body Condition:</span>
                  <span className="font-medium text-right">{vitals.vitals_body_condition_score}</span>
                </div>
              )}
              {vitals.vitals_dehydration_percent && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground flex-shrink-0">Dehydration:</span>
                  <span className="font-medium text-right">{vitals.vitals_dehydration_percent}</span>
                </div>
              )}
              {vitals.vitals_pain_score !== null && vitals.vitals_pain_score !== undefined && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground flex-shrink-0">Pain Score:</span>
                  <span className="font-medium text-right">{vitals.vitals_pain_score}/10</span>
                </div>
              )}
              {vitals.vitals_crt && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground flex-shrink-0">CRT:</span>
                  <span className="font-medium text-right">{vitals.vitals_crt}</span>
                </div>
              )}
              {vitals.vitals_mucous_membranes && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground flex-shrink-0">Mucous Membranes:</span>
                  <span className="font-medium text-right">{vitals.vitals_mucous_membranes}</span>
                </div>
              )}
              {vitals.vitals_attitude && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground flex-shrink-0">Attitude:</span>
                  <span className="font-medium text-right">{vitals.vitals_attitude}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {canEdit && consultId && effectiveClinicId && (
        <EditVitalsDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          consultId={consultId}
          clinicId={effectiveClinicId}
          currentVitals={vitals}
          onVitalsUpdated={onVitalsUpdated}
        />
      )}
    </>
  );
}
