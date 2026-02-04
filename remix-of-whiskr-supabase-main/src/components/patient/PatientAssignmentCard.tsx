import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { User, Building2, Pencil } from "lucide-react";
import { formatDisplayName } from "@/lib/formatDisplayName";

interface PatientAssignmentCardProps {
  doctorName: string | null;
  doctorPrefix?: string | null;
  clinicName: string;
  lastVisitDate?: string | null;
  canEdit?: boolean;
  onEdit?: () => void;
}

export function PatientAssignmentCard({ 
  doctorName, 
  doctorPrefix = 'Dr.',
  clinicName, 
  lastVisitDate,
  canEdit = false,
  onEdit,
}: PatientAssignmentCardProps) {
  return (
    <Card className="border-border/50 shadow-sm">
      <CardContent className="p-4 md:p-6">
        <div className="space-y-4">
          {/* Assigned to Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg md:text-xl font-bold text-foreground">
                Assigned to
              </h3>
              {canEdit && onEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={onEdit}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm">
                  <span className="font-medium text-foreground">
                    {doctorName ? formatDisplayName(doctorName, doctorPrefix) : "Unassigned"}
                  </span>
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm text-muted-foreground">
                  {clinicName}
                </span>
              </div>
            </div>
          </div>
          
          {/* Latest Visit Section */}
          <div className="pt-4 border-t border-border/50">
            <h4 className="text-sm font-semibold text-foreground mb-2">Latest Visit</h4>
            {lastVisitDate ? (
              <p className="text-sm text-muted-foreground">
                {format(new Date(lastVisitDate), "MMMM d, yyyy 'at' h:mm a")}
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
