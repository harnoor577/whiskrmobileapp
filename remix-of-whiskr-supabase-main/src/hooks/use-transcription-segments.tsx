import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TranscriptionSegment } from '@/types/transcription';

interface UseTranscriptionSegmentsResult {
  segments: TranscriptionSegment[];
  setSegments: React.Dispatch<React.SetStateAction<TranscriptionSegment[]>>;
  saveSegments: (consultId: string, clinicId: string, newSegments: TranscriptionSegment[]) => Promise<void>;
  loadSegments: (consultId: string) => Promise<TranscriptionSegment[]>;
  appendSegments: (newSegments: TranscriptionSegment[]) => void;
}

export function useTranscriptionSegments(): UseTranscriptionSegmentsResult {
  const [segments, setSegments] = useState<TranscriptionSegment[]>([]);

  const saveSegments = useCallback(async (
    consultId: string,
    clinicId: string,
    newSegments: TranscriptionSegment[]
  ) => {
    try {
      // Delete existing segments for this consult
      await supabase
        .from('consult_transcription_segments')
        .delete()
        .eq('consult_id', consultId);

      if (newSegments.length === 0) return;

      // Insert new segments
      const { error } = await supabase
        .from('consult_transcription_segments')
        .insert(
          newSegments.map((seg, idx) => ({
            consult_id: consultId,
            clinic_id: clinicId,
            sequence_number: idx,
            start_time: seg.start,
            end_time: seg.end,
            text: seg.text,
            speaker: seg.speaker,
            speaker_id: seg.speaker_id || null,
            confidence: seg.confidence || null,
          }))
        );

      if (error) {
        console.error('Error saving transcription segments:', error);
      } else {
        console.log(`Saved ${newSegments.length} transcription segments`);
      }
    } catch (error) {
      console.error('Error saving transcription segments:', error);
    }
  }, []);

  const loadSegments = useCallback(async (consultId: string): Promise<TranscriptionSegment[]> => {
    try {
      const { data: existingSegments, error } = await supabase
        .from('consult_transcription_segments')
        .select('*')
        .eq('consult_id', consultId)
        .order('sequence_number');

      if (error) {
        console.error('Error loading transcription segments:', error);
        return [];
      }

      if (existingSegments && existingSegments.length > 0) {
        const mapped = existingSegments.map(s => ({
          id: s.id,
          start: Number(s.start_time),
          end: Number(s.end_time),
          text: s.text,
          speaker: s.speaker as 'vet' | 'client' | 'unknown',
          speaker_id: s.speaker_id || undefined,
          confidence: s.confidence ? Number(s.confidence) : undefined,
        }));
        setSegments(mapped);
        console.log(`Loaded ${mapped.length} transcription segments`);
        return mapped;
      }
      return [];
    } catch (error) {
      console.error('Error loading transcription segments:', error);
      return [];
    }
  }, []);

  const appendSegments = useCallback((newSegments: TranscriptionSegment[]) => {
    setSegments(prev => [...prev, ...newSegments]);
  }, []);

  return {
    segments,
    setSegments,
    saveSegments,
    loadSegments,
    appendSegments,
  };
}
