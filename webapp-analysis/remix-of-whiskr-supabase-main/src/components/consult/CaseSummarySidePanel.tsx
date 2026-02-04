import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { User, Calendar, UserCheck } from 'lucide-react';
import { format } from 'date-fns';
import { formatDisplayName } from '@/lib/formatDisplayName';

interface CaseSummarySidePanelProps {
  patientInfo: {
    patientId?: string;
    name: string;
    species: string;
    breed?: string | null;
    sex?: string | null;
    age?: string | null;
  } | null;
  consultDate: string | null;
  assignedUserName: string | null;
  assignedUserPrefix?: string | null;
}

export function CaseSummarySidePanel({ patientInfo, consultDate, assignedUserName, assignedUserPrefix = 'Dr.' }: CaseSummarySidePanelProps) {
  const formatAge = (age: string | null | undefined) => {
    if (!age) return null;
    const years = parseInt(age);
    if (isNaN(years)) return age;
    if (years === 0) return '< 1 year';
    if (years === 1) return '1 year';
    return `${years} years`;
  };

  return (
    <div className="h-full flex flex-col gap-4 bg-muted/30 overflow-y-auto">
      {/* Patient Info Card */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
            <User className="h-4 w-4" />
            Patient
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          {patientInfo ? (
            <div className="space-y-1">
              <p className="text-base font-semibold">{patientInfo.name}</p>
              <p className="text-sm text-muted-foreground">
                {patientInfo.species}
                {patientInfo.breed && ` • ${patientInfo.breed}`}
              </p>
              {(patientInfo.sex || patientInfo.age) && (
                <p className="text-sm text-muted-foreground">
                  {patientInfo.sex}
                  {patientInfo.sex && patientInfo.age && ' • '}
                  {formatAge(patientInfo.age)}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading...</p>
          )}
        </CardContent>
      </Card>

      {/* Date & Time Card */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4" />
            Date & Time
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          {consultDate ? (
            <p className="text-sm font-medium">
              {format(new Date(consultDate), "MMM d, yyyy 'at' h:mm a")}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Not set</p>
          )}
        </CardContent>
      </Card>

      {/* Assigned To Card */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
            <UserCheck className="h-4 w-4" />
            Assigned To
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <p className="text-sm font-medium">
            {assignedUserName ? formatDisplayName(assignedUserName, assignedUserPrefix) : 'Unassigned'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
