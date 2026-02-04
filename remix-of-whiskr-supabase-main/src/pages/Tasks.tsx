import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Clock, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { TasksSkeleton } from '@/components/tasks/TasksSkeleton';

interface Task {
  id: string;
  title: string;
  status: string;
  due_at: string | null;
  created_at: string;
  assigned_to: string | null;
  consult_id: string | null;
}

interface DraftConsult {
  id: string;
  patient_id: string;
  started_at: string;
  reason_for_visit: string | null;
  soap_s: string | null;
  soap_o: string | null;
  soap_a: string | null;
  soap_p: string | null;
  case_notes: string | null;
  patient: {
    name: string;
    species: string;
  } | null;
}

export default function Tasks() {
  const { clinicId } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [draftConsults, setDraftConsults] = useState<DraftConsult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([loadTasks(), loadDraftConsults()]);
      setLoading(false);
    };
    loadAll();
  }, [clinicId]);

  const loadTasks = async () => {
    if (!clinicId) return;

    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error('Error loading tasks:', error);
    }
  };

  const loadDraftConsults = async () => {
    if (!clinicId) return;

    try {
      const { data, error } = await supabase
        .from('consults')
        .select(`
          id,
          patient_id,
          started_at,
          reason_for_visit,
          soap_s,
          soap_o,
          soap_a,
          soap_p,
          case_notes,
          patient:patients(name, species)
        `)
        .eq('clinic_id', clinicId)
        .eq('status', 'draft')
        .order('started_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setDraftConsults((data || []) as DraftConsult[]);
    } catch (error) {
      console.error('Error loading draft consults:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  const handleContinueDraft = (consult: DraftConsult) => {
    // Clear stale sessionStorage
    sessionStorage.removeItem('pendingTranscription');
    sessionStorage.removeItem('parsedPatientInfo');
    sessionStorage.removeItem('uploadedDiagnosticsCount');
    sessionStorage.removeItem('pendingRecording');
    sessionStorage.removeItem('pendingRecordingDuration');
    
    sessionStorage.setItem('inputMode', 'continue');
    
    // Check what report data exists
    const hasSOAP = consult.soap_s || consult.soap_o || consult.soap_a || consult.soap_p;
    
    let hasWellness = false;
    let hasProcedure = false;
    
    if (consult.case_notes) {
      try {
        const parsed = JSON.parse(consult.case_notes);
        hasWellness = !!parsed.wellness;
        hasProcedure = !!parsed.procedure;
      } catch {
        // Not JSON, ignore
      }
    }
    
    // Navigate to appropriate editor based on existing data
    if (hasSOAP) {
      navigate(`/soap-editor/${consult.id}`);
    } else if (hasWellness) {
      navigate(`/wellness-editor/${consult.id}`);
    } else if (hasProcedure) {
      navigate(`/procedure-editor/${consult.id}`);
    } else {
      // No report generated yet - go to post-recording
      navigate(`/post-recording/${consult.id}`);
    }
  };

  if (loading) {
    return <TasksSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Tasks</h1>
        <p className="text-muted-foreground">Manage your clinic tasks and follow-ups</p>
      </div>

      {/* Draft Consultations Section */}
      {draftConsults.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Draft Consultations
          </h2>
          <div className="grid gap-3">
            {draftConsults.map((consult) => (
              <Card key={consult.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg flex items-center gap-2">
                        {consult.patient?.name || 'Unknown Patient'}
                        <span className="text-sm font-normal text-muted-foreground">
                          ({consult.patient?.species || 'Unknown'})
                        </span>
                      </CardTitle>
                      <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        Started: {format(new Date(consult.started_at), 'MMM d, yyyy h:mm a')}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300">
                        Draft
                      </Badge>
                      <Button 
                        size="sm"
                        onClick={() => handleContinueDraft(consult)}
                      >
                        Continue
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Tasks Section */}
      {tasks.length === 0 && draftConsults.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Tasks Yet</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Tasks will appear here when they are created or assigned to you.
            </p>
          </CardContent>
        </Card>
      ) : tasks.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Tasks
          </h2>
          <div className="grid gap-4">
            {tasks.map((task) => (
              <Card key={task.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{task.title}</CardTitle>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {format(new Date(task.created_at), 'MMM d, yyyy')}
                        </div>
                        {task.due_at && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            Due: {format(new Date(task.due_at), 'MMM d, yyyy')}
                          </div>
                        )}
                      </div>
                    </div>
                    <Badge className={getStatusColor(task.status)}>
                      {task.status}
                    </Badge>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}