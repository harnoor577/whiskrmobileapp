export interface TranscriptionSegment {
  id: string;
  start: number;      // seconds
  end: number;        // seconds
  text: string;
  speaker: 'vet' | 'client' | 'unknown';
  speaker_id?: string;
  confidence?: number;
}

export interface AudioEvent {
  type: string;       // 'laughter', 'applause', 'music', etc.
  start: number;
  end: number;
}

export interface TranscriptionResult {
  text: string;
  duration: number;
  segments?: TranscriptionSegment[];
  audio_events?: AudioEvent[];
}
