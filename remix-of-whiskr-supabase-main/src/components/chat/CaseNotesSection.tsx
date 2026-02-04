import { useState, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Plus, X, StickyNote } from 'lucide-react';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { VoiceRecorder } from '@/components/voice/VoiceRecorder';
interface CaseNote {
  id: string;
  note: string;
  created_at: string;
  created_by: string;
  profiles?: {
    name: string;
  } | null;
}

interface CaseNotesSectionProps {
  consultId: string;
  clinicId: string;
  onNoteAdded?: () => void;
  embedded?: boolean;
}

export function CaseNotesSection({ consultId, clinicId, onNoteAdded, embedded = false }: CaseNotesSectionProps) {
  const [currentNote, setCurrentNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [notes, setNotes] = useState<CaseNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const { toast } = useToast();

  const handleTranscriptionComplete = (text: string) => {
    setCurrentNote((prev) => {
      if (prev.trim()) {
        return prev + '\n' + text;
      }
      return text;
    });
  };

  const handleRecordingError = (error: string) => {
    toast({
      variant: 'destructive',
      title: 'Recording Error',
      description: error,
    });
  };

  const fetchNotes = async () => {
    const { data, error } = await supabase
      .from('case_notes')
      .select('id, note, created_at, created_by')
      .eq('consult_id', consultId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      // Fetch profile names for each note
      const notesWithProfiles = await Promise.all(
        data.map(async (note) => {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('name')
            .eq('user_id', note.created_by)
            .single();
          
          return {
            ...note,
            profiles: profileData,
          };
        })
      );
      setNotes(notesWithProfiles);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchNotes();
  }, [consultId]);

  const handleSubmitNote = async () => {
    if (!currentNote.trim()) return;

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Save note to case_notes table
      const { error: noteError } = await supabase
        .from('case_notes')
        .insert({
          consult_id: consultId,
          clinic_id: clinicId,
          note: currentNote.trim(),
          created_by: user.id,
        });

      if (noteError) throw noteError;

      // Call edge function to process note and update AI memory
      const { error: processError } = await supabase.functions.invoke('process-case-note', {
        body: { consultId, note: currentNote.trim() }
      });

      if (processError) {
        console.error('Error processing case note:', processError);
      }

      setCurrentNote('');
      setIsExpanded(false);
      
      // Refresh the notes list
      await fetchNotes();
      
      onNoteAdded?.();
      
      toast({
        title: 'Case note added',
        description: 'Note has been saved successfully',
      });
    } catch (error: any) {
      console.error('Error submitting note:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to save case note',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setCurrentNote('');
    setIsExpanded(false);
  };

  const content = (
    <div className="space-y-3">
      {/* Existing Notes */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading notes...</div>
      ) : notes.length > 0 ? (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="bg-muted/50 rounded-lg p-3">
              <p className="text-sm whitespace-pre-wrap">{note.note}</p>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{note.profiles?.name || 'Unknown'}</span>
                <span>•</span>
                <span>{format(new Date(note.created_at), 'MMM d, yyyy h:mm a')}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No case notes yet.</p>
      )}

      {/* Add Note Form */}
      {!isExpanded ? (
        <Button 
          onClick={() => setIsExpanded(true)}
          variant="outline"
          size="sm"
          className="w-full h-9 gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Note
        </Button>
      ) : (
        <div className="space-y-2 pt-2 border-t">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Add Case Note</label>
            <Button
              onClick={handleCancel}
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={isRecording}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Recording overlay slot */}
          <div id="case-note-recording-slot" className={isRecording ? 'block' : 'hidden'} />
          
          {/* Textarea with mic button - flex layout */}
          <div className="flex gap-2 items-end">
            {/* Textarea - only hide the textarea, not the whole container */}
            {!isRecording && (
              <div className="flex-1">
                <Textarea
                  value={currentNote}
                  onChange={(e) => setCurrentNote(e.target.value)}
                  placeholder="Document additional observations, follow-up plans, or updates..."
                  className="min-h-[70px] resize-y"
                  disabled={isSubmitting}
                  autoFocus
                />
              </div>
            )}
            
            {/* Single VoiceRecorder - always mounted */}
            <VoiceRecorder
              onTranscriptionComplete={handleTranscriptionComplete}
              onError={handleRecordingError}
              inline={true}
              isRecording={isRecording}
              onRecordingChange={setIsRecording}
              overlayContainerId="case-note-recording-slot"
              consultId={consultId}
            />
          </div>
          
          <div className="flex gap-2">
            <Button 
              onClick={handleSubmitNote}
              disabled={!currentNote.trim() || isSubmitting || isRecording}
              size="sm"
              className="flex-1"
            >
              {isSubmitting ? 'Saving...' : 'Save Note'}
            </Button>
            <Button 
              onClick={handleCancel}
              disabled={isSubmitting || isRecording}
              variant="outline"
              size="sm"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <Card className="shadow-lg">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <StickyNote className="h-4 w-4" />
          Case Notes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-[200px]">
          {content}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
