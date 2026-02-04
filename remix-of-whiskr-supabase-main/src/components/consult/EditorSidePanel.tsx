import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { 
  Mic, 
  Upload, 
  Eye, 
  FileText, 
  Heart, 
  Scissors, 
  Loader2,
  Stethoscope,
  CalendarIcon,
  Clock,
  User,
  Pencil
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { EditPatientBasicDialog } from './EditPatientBasicDialog';

interface AssignedUser {
  user_id: string;
  name: string;
}

interface EditorSidePanelProps {
  consultId: string;
  patientInfo: {
    patientId: string;
    id?: string;
    name: string;
    species: string;
    breed?: string;
    sex?: string;
    age?: string;
    dateOfBirth?: string;
  } | null;
  currentReportType: 'soap' | 'wellness' | 'procedure';
  uploadedFilesCount: number;
  isTranscribing: boolean;
  onContinueRecording: () => void;
  onUploadDiagnostics: () => void;
  onViewInput: () => void;
  clinicId?: string;
  onPatientUpdated?: () => void;
}

export function EditorSidePanel({
  consultId,
  patientInfo,
  currentReportType,
  uploadedFilesCount,
  isTranscribing,
  onContinueRecording,
  onUploadDiagnostics,
  onViewInput,
  clinicId,
  onPatientUpdated,
}: EditorSidePanelProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showEditPatientDialog, setShowEditPatientDialog] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [generatingReportType, setGeneratingReportType] = useState<string | null>(null);

  // State for consult date/time - prefill with current date/time in 12-hour format
  const now = new Date();
  const initialHour24 = now.getHours();
  const initialHour12 = initialHour24 === 0 ? 12 : initialHour24 > 12 ? initialHour24 - 12 : initialHour24;
  const [consultDate, setConsultDate] = useState<Date | null>(now);
  const [consultHour, setConsultHour] = useState<string>(initialHour12.toString().padStart(2, '0'));
  const [consultMinute, setConsultMinute] = useState<string>((Math.floor(now.getMinutes() / 15) * 15).toString().padStart(2, '0'));
  const [consultPeriod, setConsultPeriod] = useState<string>(initialHour24 >= 12 ? 'PM' : 'AM');
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);

  // State for assignments
  const [assignedUsers, setAssignedUsers] = useState<AssignedUser[]>([]);
  const [availableUsers, setAvailableUsers] = useState<AssignedUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  // Load consult data on mount
  useEffect(() => {
    if (consultId) {
      loadConsultData();
    }
  }, [consultId, clinicId]);

  const loadConsultData = async () => {
    try {
      // Fetch consult date
      const { data: consult } = await supabase
        .from('consults')
        .select('started_at, clinic_id')
        .eq('id', consultId)
        .single();

      if (consult?.started_at) {
        const date = new Date(consult.started_at);
        const hour24 = date.getHours();
        const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
        setConsultDate(date);
        setConsultHour(hour12.toString().padStart(2, '0'));
        setConsultMinute(date.getMinutes().toString().padStart(2, '0'));
        setConsultPeriod(hour24 >= 12 ? 'PM' : 'AM');
      }

      const effectiveClinicId = clinicId || consult?.clinic_id;

      // Fetch assigned users
      const { data: assignments } = await supabase
        .from('consult_assignments')
        .select('user_id')
        .eq('consult_id', consultId);

      if (assignments && assignments.length > 0) {
        const userIds = assignments.map(a => a.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, name')
          .in('user_id', userIds);

        if (profiles) {
          setAssignedUsers(profiles);
          if (profiles.length > 0) {
            setSelectedUserId(profiles[0].user_id);
          }
        }
      }

      // Fetch available users from clinic
      if (effectiveClinicId) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, name')
          .eq('clinic_id', effectiveClinicId)
          .eq('status', 'active');

        if (profiles) {
          setAvailableUsers(profiles);
        }
      }
    } catch (error) {
      console.error('Error loading consult data:', error);
    }
  };

  // Convert 12-hour to 24-hour
  const convertTo24Hour = (hour: string, period: string): number => {
    let hour24 = parseInt(hour);
    if (period === 'AM' && hour24 === 12) hour24 = 0;
    if (period === 'PM' && hour24 !== 12) hour24 += 12;
    return hour24;
  };

  const handleDateChange = async (date: Date | undefined) => {
    if (!date || !consultId) return;

    // Preserve existing time in 24-hour format
    const newDate = new Date(date);
    const hour24 = convertTo24Hour(consultHour, consultPeriod);
    newDate.setHours(hour24, parseInt(consultMinute));
    
    setConsultDate(newDate);
    setDatePopoverOpen(false);

    try {
      await supabase
        .from('consults')
        .update({ started_at: newDate.toISOString() })
        .eq('id', consultId);
    } catch (error) {
      console.error('Error updating consult date:', error);
      toast({ title: 'Failed to update date', variant: 'destructive' });
    }
  };

  const handleTimeChange = async (hour: string, minute: string, period: string) => {
    if (!consultDate || !consultId) return;

    setConsultHour(hour);
    setConsultMinute(minute);
    setConsultPeriod(period);

    const newDate = new Date(consultDate);
    const hour24 = convertTo24Hour(hour, period);
    newDate.setHours(hour24, parseInt(minute));
    setConsultDate(newDate);

    try {
      await supabase
        .from('consults')
        .update({ started_at: newDate.toISOString() })
        .eq('id', consultId);
    } catch (error) {
      console.error('Error updating consult time:', error);
      toast({ title: 'Failed to update time', variant: 'destructive' });
    }
  };

  const handleAssignmentChange = async (userId: string) => {
    if (!consultId || !userId) return;

    setSelectedUserId(userId);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Remove existing assignments
      await supabase
        .from('consult_assignments')
        .delete()
        .eq('consult_id', consultId);

      // Add new assignment
      if (userId !== 'unassigned' && clinicId) {
        await supabase
          .from('consult_assignments')
          .insert({
            consult_id: consultId,
            user_id: userId,
            assigned_by: user?.id || null,
            clinic_id: clinicId,
          });

        const selectedUser = availableUsers.find(u => u.user_id === userId);
        if (selectedUser) {
          setAssignedUsers([selectedUser]);
        }
      } else {
        setAssignedUsers([]);
      }

      
    } catch (error) {
      console.error('Error updating assignment:', error);
      toast({ title: 'Failed to update assignment', variant: 'destructive' });
    }
  };

  const reportTypes = [
    { id: 'soap', label: 'SOAP Report', icon: FileText, path: 'soap-editor' },
    { id: 'wellness', label: 'Wellness Report', icon: Heart, path: 'wellness-editor' },
    { id: 'procedure', label: 'Procedure Notes', icon: Scissors, path: 'procedure-editor' },
  ];

  const handleSwitchReport = async (reportId: string, path: string) => {
    if (reportId === currentReportType) return;

    // Check if target report already exists in database
    const { data: existingConsult } = await supabase
      .from('consults')
      .select('soap_s, soap_o, soap_a, soap_p, case_notes, history_summary')
      .eq('id', consultId)
      .single();

    let hasTargetReport = false;

    if (reportId === 'soap') {
      hasTargetReport = !!(existingConsult?.soap_s || existingConsult?.soap_o || 
                           existingConsult?.soap_a || existingConsult?.soap_p);
    } else if (reportId === 'wellness' || reportId === 'procedure') {
      if (existingConsult?.case_notes) {
        try {
          const caseNotes = typeof existingConsult.case_notes === 'string'
            ? JSON.parse(existingConsult.case_notes)
            : existingConsult.case_notes;
          hasTargetReport = !!(caseNotes?.[reportId]);
        } catch {
          hasTargetReport = false;
        }
      }
    }

    if (hasTargetReport) {
      // Check if input was modified since last report generation
      const inputModified = sessionStorage.getItem('inputModified') === 'true';
      
      if (inputModified) {
        // Clear the flag and navigate with regenerate parameter
        sessionStorage.removeItem('inputModified');
        navigate(`/${path}/${consultId}?regenerate=true`);
      } else {
        // Report exists and input unchanged - navigate directly
        navigate(`/${path}/${consultId}`);
      }
      return;
    }

    // No report exists - GENERATE IT (same as PostRecordingOptions)
    // Check sessionStorage first, then history_summary as fallback
    const transcription = sessionStorage.getItem(`pendingTranscription_${consultId}`) || 
                          existingConsult?.history_summary?.trim() || '';
    
    if (!transcription || transcription.length < 50) {
      toast({
        title: "Insufficient Information",
        description: "Please provide more details about the consultation before generating a report.",
        variant: "destructive"
      });
      return;
    }

    setIsGeneratingReport(true);
    setGeneratingReportType(reportId);

    try {
      const functionName = reportId === 'soap' ? 'generate-soap' 
        : reportId === 'wellness' ? 'generate-wellness' 
        : 'generate-procedure';

      const { data, error } = await supabase.functions.invoke(functionName, {
        body: {
          consultId,
          transcription,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }
      });

      if (error) throw error;

      // Check for insufficient data errors
      if (data?.error === 'INSUFFICIENT_CLINICAL_DATA' || 
          data?.[reportId]?.error === 'INSUFFICIENT_CLINICAL_DATA') {
        toast({
          title: "Insufficient Clinical Data",
          description: "The AI could not generate accurate notes. Please add more clinical details.",
          variant: "destructive"
        });
        return;
      }

      // Success - navigate to the editor
      navigate(`/${path}/${consultId}`);
      
    } catch (error: any) {
      console.error(`Error generating ${reportId} report:`, error);
      toast({
        title: "Generation Failed",
        description: error.message || `Failed to generate report. Please try again.`,
        variant: "destructive"
      });
    } finally {
      setIsGeneratingReport(false);
      setGeneratingReportType(null);
    }
  };

  // Generate hour options (12-hour format: 01-12)
  const hours = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'));
  const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

  return (
    <div className="h-full flex flex-col bg-muted/30 border-r relative">
      {/* Loading overlay for report generation */}
      {isGeneratingReport && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-50">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Generating {generatingReportType === 'soap' ? 'SOAP Notes' 
                : generatingReportType === 'wellness' ? 'Wellness Report' 
                : 'Procedure Notes'}...
            </p>
          </div>
        </div>
      )}
      {/* Patient Info & Consult Details */}
      <div className="p-4 border-b bg-card space-y-4">
        {/* Patient Name */}
        {patientInfo && (
          <div className="relative flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Stethoscope className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm truncate">{patientInfo.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {patientInfo.species} {patientInfo.breed ? `• ${patientInfo.breed}` : ''}
              </p>
              {(patientInfo.sex || patientInfo.age) && (
                <p className="text-xs text-muted-foreground truncate">
                  {patientInfo.sex}{patientInfo.sex && patientInfo.age ? ' • ' : ''}{patientInfo.age}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-0 right-0 h-6 w-6"
              onClick={() => setShowEditPatientDialog(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* Date & Time */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarIcon className="h-3.5 w-3.5" />
            <span>Visit Date & Time</span>
          </div>
          <div className="space-y-2">
            <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "w-full justify-start text-left font-normal text-xs h-8",
                    !consultDate && "text-muted-foreground"
                  )}
                >
                  {consultDate ? format(consultDate, "MMM d, yyyy") : "Select date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={consultDate || undefined}
                  onSelect={handleDateChange}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <div className="flex gap-1">
              <Select value={consultHour} onValueChange={(h) => handleTimeChange(h, consultMinute, consultPeriod)}>
                <SelectTrigger className="w-14 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {hours.map((h) => (
                    <SelectItem key={h} value={h} className="text-xs">{h}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="flex items-center text-xs text-muted-foreground">:</span>
              <Select value={consultMinute} onValueChange={(m) => handleTimeChange(consultHour, m, consultPeriod)}>
                <SelectTrigger className="w-14 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {minutes.map((m) => (
                    <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={consultPeriod} onValueChange={(p) => handleTimeChange(consultHour, consultMinute, p)}>
                <SelectTrigger className="w-16 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AM" className="text-xs">AM</SelectItem>
                  <SelectItem value="PM" className="text-xs">PM</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Assigned To */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <User className="h-3.5 w-3.5" />
            <span>Assigned To</span>
          </div>
          <Select value={selectedUserId || 'unassigned'} onValueChange={handleAssignmentChange}>
            <SelectTrigger className="w-full h-8 text-xs">
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned" className="text-xs">Unassigned</SelectItem>
              {availableUsers.map((user) => (
                <SelectItem key={user.user_id} value={user.user_id} className="text-xs">
                  Dr. {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <Tabs defaultValue="recording" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="recording" className="text-xs gap-1.5">
              <Mic className="h-3.5 w-3.5" />
              Recording
            </TabsTrigger>
            <TabsTrigger value="report-type" className="text-xs gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Report Type
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="recording" className="mt-0 space-y-2">
            <button
              className="w-full flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent hover:shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={onContinueRecording}
              disabled={isTranscribing}
            >
              <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
                {isTranscribing ? (
                  <Loader2 className="h-4 w-4 text-red-600 animate-spin" />
                ) : (
                  <Mic className="h-4 w-4 text-red-600" />
                )}
              </div>
              <span className="text-sm font-medium text-foreground">Continue Recording</span>
            </button>

            <button
              className="w-full flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent hover:shadow-sm transition-all"
              onClick={onUploadDiagnostics}
            >
              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                <Upload className="h-4 w-4 text-blue-600" />
              </div>
              <span className="text-sm font-medium text-foreground">Upload Diagnostics</span>
              {uploadedFilesCount > 0 && (
                <Badge variant="secondary" className="ml-auto bg-blue-200 text-blue-800">
                  {uploadedFilesCount}
                </Badge>
              )}
            </button>

            <button
              className="w-full flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent hover:shadow-sm transition-all"
              onClick={onViewInput}
            >
              <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                <Eye className="h-4 w-4 text-green-600" />
              </div>
              <span className="text-sm font-medium text-foreground">View/Edit Input</span>
            </button>
          </TabsContent>
          
          <TabsContent value="report-type" className="mt-0 space-y-2">
            {reportTypes.map((report) => {
              const Icon = report.icon;
              const isActive = report.id === currentReportType;
              
              return (
                <button
                  key={report.id}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    isActive 
                      ? 'bg-primary border-primary text-primary-foreground' 
                      : 'bg-card border-border text-foreground hover:bg-accent hover:shadow-sm'
                  }`}
                  onClick={() => handleSwitchReport(report.id, report.path)}
                  disabled={isActive}
                >
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                    isActive ? 'bg-primary-foreground/20' : 'bg-muted'
                  }`}>
                    <Icon className={`h-4 w-4 ${isActive ? 'text-primary-foreground' : 'text-foreground'}`} />
                  </div>
                  <span className="text-sm font-medium">{report.label}</span>
                  {isActive && (
                    <Badge variant="secondary" className="ml-auto bg-primary-foreground/20 text-primary-foreground text-xs">
                      Current
                    </Badge>
                  )}
                </button>
              );
            })}
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Patient Dialog */}
      <EditPatientBasicDialog
        open={showEditPatientDialog}
        onOpenChange={setShowEditPatientDialog}
      patient={patientInfo ? {
        id: patientInfo.id || '',
        name: patientInfo.name,
        species: patientInfo.species,
        breed: patientInfo.breed,
        sex: patientInfo.sex,
        age: patientInfo.age,
        dateOfBirth: patientInfo.dateOfBirth,
        identifiers: { patient_id: patientInfo.patientId },
      } : null}
        onPatientUpdated={() => {
          onPatientUpdated?.();
        }}
      />
    </div>
  );
}
