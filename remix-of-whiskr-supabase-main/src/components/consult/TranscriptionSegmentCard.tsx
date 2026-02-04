import { useState } from 'react';
import { Stethoscope, User, HelpCircle, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TranscriptionSegment } from '@/types/transcription';
import { cn } from '@/lib/utils';

interface TranscriptionSegmentCardProps {
  segment: TranscriptionSegment;
  onUpdate: (updated: TranscriptionSegment) => void;
}

const speakerConfig = {
  vet: { 
    icon: Stethoscope, 
    label: 'Vet',
    color: 'text-blue-600', 
    bg: 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
  },
  client: { 
    icon: User, 
    label: 'Client',
    color: 'text-green-600', 
    bg: 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800',
    badge: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
  },
  unknown: { 
    icon: HelpCircle, 
    label: 'Unknown',
    color: 'text-muted-foreground', 
    bg: 'bg-muted/50 border-border',
    badge: 'bg-muted text-muted-foreground'
  }
};

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function TranscriptionSegmentCard({
  segment,
  onUpdate,
}: TranscriptionSegmentCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(segment.text);

  const config = speakerConfig[segment.speaker];
  const Icon = config.icon;

  const handleSave = () => {
    onUpdate({ ...segment, text: editText });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditText(segment.text);
    setIsEditing(false);
  };

  const handleSpeakerChange = (newSpeaker: 'vet' | 'client' | 'unknown') => {
    onUpdate({ ...segment, speaker: newSpeaker });
  };

  return (
    <div className={cn('rounded-lg border p-3 transition-colors overflow-hidden min-w-0 w-full max-w-full', config.bg)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className={cn('h-4 w-4', config.color)} />
          <Select 
            value={segment.speaker} 
            onValueChange={handleSpeakerChange}
          >
            <SelectTrigger className="h-7 w-24 text-xs border-0 bg-transparent hover:bg-background/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vet">
                <span className="flex items-center gap-1">
                  <Stethoscope className="h-3 w-3" /> Vet
                </span>
              </SelectItem>
              <SelectItem value="client">
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" /> Client
                </span>
              </SelectItem>
              <SelectItem value="unknown">
                <span className="flex items-center gap-1">
                  <HelpCircle className="h-3 w-3" /> Unknown
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <span className="text-xs text-muted-foreground font-mono">
          {formatTime(segment.start)} - {formatTime(segment.end)}
        </span>
      </div>

      {/* Content */}
      {isEditing ? (
        <div className="space-y-2">
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="min-h-[60px] text-sm resize-none"
            autoFocus
          />
          <div className="flex justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCancel}
              className="h-7 px-2"
            >
              <X className="h-3 w-3 mr-1" />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              className="h-7 px-2"
            >
              <Check className="h-3 w-3 mr-1" />
              Save
            </Button>
          </div>
        </div>
      ) : (
      <p 
        className="text-sm cursor-text hover:bg-background/50 rounded p-1 -m-1 transition-colors break-words [overflow-wrap:anywhere] [word-break:break-word]"
        onClick={() => setIsEditing(true)}
      >
        {segment.text}
      </p>
      )}
    </div>
  );
}
