import { supabase } from '@/integrations/supabase/client';
import { TranscriptionResult, TranscriptionSegment } from '@/types/transcription';

export async function convertBlobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function transcribeAudio(
  audioBlob: Blob,
  consultId?: string
): Promise<TranscriptionResult> {
  try {
    const base64Audio = await convertBlobToBase64(audioBlob);
    
    // Extract format from MIME type (e.g., "audio/webm;codecs=opus" -> "webm")
    const mimeType = audioBlob.type || 'audio/webm';
    const format = mimeType.split(';')[0].split('/')[1] || 'webm';
    
    console.log('Transcribing audio with ElevenLabs Scribe v2:', { 
      mimeType, 
      format, 
      sizeKB: Math.round(audioBlob.size / 1024) 
    });
    
    const { data, error } = await supabase.functions.invoke('transcribe-audio', {
      body: {
        audio: base64Audio,
        format,
        language: 'en',
        consultId,
      },
    });

    if (error) {
      throw new Error(error.message || 'Failed to transcribe audio');
    }

    if (!data || !data.text) {
      throw new Error('No transcription text received');
    }

    console.log(`Transcription complete: ${data.segments?.length || 0} speaker segments`);

    return {
      text: data.text,
      duration: data.duration || 0,
      segments: data.segments || [],
      audio_events: data.audio_events || []
    };
  } catch (error: any) {
    console.error('Transcription error:', error);
    throw error;
  }
}

export function getAudioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.onloadedmetadata = () => {
      resolve(audio.duration);
    };
    audio.onerror = reject;
    audio.src = URL.createObjectURL(blob);
  });
}

export function mergeAudioChunks(chunks: Blob[]): Blob {
  return new Blob(chunks, { type: 'audio/webm' });
}
