import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FileText, Mic, FolderPlus, Upload, FileEdit, Heart, Stethoscope, ClipboardList, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { ReactNode } from "react";

type ActivityType = 
  | 'case_created' 
  | 'recording_complete' 
  | 'info_received' 
  | 'soap_generated' 
  | 'wellness_generated' 
  | 'procedure_generated' 
  | 'discharge_created' 
  | 'case_finalized' 
  | 'diagnostic_uploaded';

interface ActivityItem {
  id: string;
  type: ActivityType;
  title: string;
  userName?: string;
  timestamp: string;
}

interface CaseActivityDialogProps {
  consults: any[];
  trigger?: ReactNode;
  currentUserName?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const getActivityIcon = (type: ActivityType) => {
  switch (type) {
    case 'case_created':
      return FolderPlus;
    case 'recording_complete':
      return Mic;
    case 'info_received':
      return FileEdit;
    case 'soap_generated':
      return FileText;
    case 'wellness_generated':
      return Heart;
    case 'procedure_generated':
      return Stethoscope;
    case 'discharge_created':
      return ClipboardList;
    case 'case_finalized':
      return CheckCircle2;
    case 'diagnostic_uploaded':
      return Upload;
    default:
      return FolderPlus;
  }
};

export function CaseActivityDialog({ consults, trigger, currentUserName, open, onOpenChange }: CaseActivityDialogProps) {
  // Derive activities from consults data
  const activities: ActivityItem[] = [];

  consults.forEach((consult) => {
    const rawVetName = consult.vet_profile?.name || currentUserName;
    const rawFinalizedByName = consult.finalized_by_profile?.name || currentUserName;
    const vetName = rawVetName ? `Dr. ${rawVetName}` : undefined;
    const finalizedByName = rawFinalizedByName ? `Dr. ${rawFinalizedByName}` : undefined;

    // 1. Case created
    activities.push({
      id: `case-${consult.id}`,
      type: 'case_created',
      title: 'Case created',
      userName: vetName,
      timestamp: consult.created_at,
    });

    // 2. Recording complete OR Information received
    if (consult.original_input) {
      if (consult.audio_duration_seconds && consult.audio_duration_seconds > 0) {
        activities.push({
          id: `recording-${consult.id}`,
          type: 'recording_complete',
          title: 'Recording complete',
          userName: vetName,
          timestamp: consult.created_at,
        });
      } else {
        activities.push({
          id: `info-${consult.id}`,
          type: 'info_received',
          title: 'Information received',
          userName: vetName,
          timestamp: consult.created_at,
        });
      }
    }

    // 3. SOAP generated
    if (consult.soap_s || consult.soap_o || consult.soap_a || consult.soap_p) {
      activities.push({
        id: `soap-${consult.id}`,
        type: 'soap_generated',
        title: 'SOAP notes generated',
        userName: vetName,
        timestamp: consult.updated_at || consult.created_at,
      });
    }

    // 4. Parse case_notes for wellness/procedure
    let caseNotes: any = null;
    if (consult.case_notes) {
      try {
        caseNotes = typeof consult.case_notes === 'string' 
          ? JSON.parse(consult.case_notes) 
          : consult.case_notes;
      } catch {
        caseNotes = null;
      }
    }

    // 5. Wellness generated
    if (caseNotes?.wellness) {
      activities.push({
        id: `wellness-${consult.id}`,
        type: 'wellness_generated',
        title: 'Wellness report generated',
        userName: vetName,
        timestamp: consult.updated_at || consult.created_at,
      });
    }

    // 6. Procedure generated
    if (caseNotes?.procedure) {
      activities.push({
        id: `procedure-${consult.id}`,
        type: 'procedure_generated',
        title: 'Procedure notes generated',
        userName: vetName,
        timestamp: consult.updated_at || consult.created_at,
      });
    }

    // 7. Discharge summary created
    if (consult.discharge_summary) {
      activities.push({
        id: `discharge-${consult.id}`,
        type: 'discharge_created',
        title: 'Discharge summary created',
        userName: vetName,
        timestamp: consult.updated_at || consult.created_at,
      });
    }

    // 8. Case finalized
    if (consult.status === 'final' && consult.finalized_at) {
      activities.push({
        id: `finalized-${consult.id}`,
        type: 'case_finalized',
        title: 'Case finalized',
        userName: finalizedByName || vetName,
        timestamp: consult.finalized_at,
      });
    }
  });

  // Define activity priority order (lower = earlier in timeline)
  const activityPriority: Record<ActivityType, number> = {
    'case_created': 1,
    'recording_complete': 2,
    'info_received': 2,
    'diagnostic_uploaded': 3,
    'soap_generated': 4,
    'wellness_generated': 5,
    'procedure_generated': 6,
    'discharge_created': 7,
    'case_finalized': 99,  // Always last
  };

  // Sort by timestamp first, then by priority for same timestamps
  // Special handling: case_finalized ALWAYS goes last regardless of timestamp
  activities.sort((a, b) => {
    // Always push case_finalized to the end
    if (a.type === 'case_finalized' && b.type !== 'case_finalized') return 1;
    if (b.type === 'case_finalized' && a.type !== 'case_finalized') return -1;
    
    const timeDiff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    if (timeDiff !== 0) return timeDiff;
    return activityPriority[a.type] - activityPriority[b.type];
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && (
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Case Activity</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
          {activities.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">No activity recorded yet</p>
          ) : (
            activities.map((activity) => {
              const Icon = getActivityIcon(activity.type);
              return (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                >
                  <div className="h-10 w-10 rounded-lg bg-background flex items-center justify-center flex-shrink-0">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{activity.title}</p>
                    {activity.userName && (
                      <p className="text-xs text-muted-foreground">
                        by {activity.userName}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(activity.timestamp), 'MMM d, yyyy h:mm a')}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
