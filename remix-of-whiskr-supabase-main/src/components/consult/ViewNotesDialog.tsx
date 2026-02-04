import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface ViewNotesDialogProps {
  consultId: string;
  disabled?: boolean;
}

interface CaseNote {
  id: string;
  note: string;
  created_at: string;
  created_by: string;
  profile?: {
    name: string;
  };
}

export function ViewNotesDialog({ consultId, disabled }: ViewNotesDialogProps) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<CaseNote[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadNotes();
    }
  }, [open, consultId]);

  const loadNotes = async () => {
    setLoading(true);
    try {
      // Fetch case notes
      const { data: notesData, error: notesError } = await supabase
        .from('case_notes')
        .select('id, note, created_at, created_by')
        .eq('consult_id', consultId)
        .order('created_at', { ascending: false });

      if (notesError) throw notesError;

      // Fetch user profiles for all note creators
      const userIds = [...new Set(notesData?.map(n => n.created_by) || [])];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, name')
        .in('user_id', userIds);

      // Map profiles to notes
      const profileMap = new Map(profilesData?.map(p => [p.user_id, p]) || []);
      const notesWithProfiles = notesData?.map(note => ({
        ...note,
        profile: profileMap.get(note.created_by)
      })) || [];

      setNotes(notesWithProfiles);
    } catch (error: any) {
      console.error('Error loading notes:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load case notes',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 px-2" disabled={disabled}>
          <FileText className="h-3 w-3 sm:mr-1" />
          <span className="hidden sm:inline">Notes</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Case Notes</DialogTitle>
          <DialogDescription>
            All notes added to this consultation after finalization
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[500px] pr-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : notes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No case notes yet
            </div>
          ) : (
            <div className="space-y-4">
              {notes.map((note) => (
                <div key={note.id} className="p-4 rounded-lg border bg-card space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">
                      {note.profile?.name || 'Unknown User'}
                    </span>
                    <span className="text-muted-foreground">
                      {format(new Date(note.created_at), 'MMM d, yyyy h:mm a')}
                    </span>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{note.note}</p>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
