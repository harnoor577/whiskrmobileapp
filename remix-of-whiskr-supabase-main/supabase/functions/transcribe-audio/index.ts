import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { sanitizeError } from "../_shared/errorHandler.ts";
import { withAIRateLimit } from '../_shared/aiRateLimiter.ts';

const requestSchema = z.object({
  audio: z.string().min(1),
  format: z.string().optional().default('webm'),
  language: z.string().optional().default('en'),
  consultId: z.string().uuid().optional(),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ElevenLabsWord {
  text: string;
  start: number;
  end: number;
  speaker_id?: string;
}

interface ElevenLabsAudioEvent {
  type: string;
  start: number;
  end: number;
}

interface TranscriptionSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  speaker: 'vet' | 'client' | 'unknown';
  speaker_id?: string;
}

function mapSpeakerLabel(speakerId?: string): 'vet' | 'client' | 'unknown' {
  if (!speakerId) return 'unknown';
  // speaker_0 is typically the person who starts speaking (usually vet in consult)
  // speaker_1 is typically the client
  const speakerNum = parseInt(speakerId.replace('speaker_', ''));
  if (speakerNum === 0) return 'vet';
  if (speakerNum === 1) return 'client';
  return 'unknown';
}

function groupWordsIntoSegments(words: ElevenLabsWord[]): TranscriptionSegment[] {
  const segments: TranscriptionSegment[] = [];
  let currentSegment: TranscriptionSegment | null = null;
  
  for (const word of words) {
    const speakerId = word.speaker_id || 'unknown';
    
    if (!currentSegment || currentSegment.speaker_id !== speakerId) {
      // Start new segment
      if (currentSegment) segments.push(currentSegment);
      currentSegment = {
        id: crypto.randomUUID(),
        start: word.start,
        end: word.end,
        text: word.text,
        speaker_id: speakerId,
        speaker: mapSpeakerLabel(speakerId)
      };
    } else {
      // Extend current segment
      currentSegment.end = word.end;
      currentSegment.text += ' ' + word.text;
    }
  }
  
  if (currentSegment) segments.push(currentSegment);
  return segments;
}

function calculateDuration(words: ElevenLabsWord[]): number {
  if (!words || words.length === 0) return 0;
  return words[words.length - 1].end;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user before processing
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('Authentication failed:', authError?.message || 'No user found');
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated user:', user.id);

    // Check rate limit for AI function
    const rateLimitResponse = await withAIRateLimit(supabase, user.id, 'transcribe_audio', corsHeaders);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const body = await req.json();
    console.log('Received transcription request from user:', user.id);
    
    const validationResult = requestSchema.safeParse(body);
    
    if (!validationResult.success) {
      console.error('Validation failed:', validationResult.error.errors.map(e => e.path.join('.')));
      return new Response(
        JSON.stringify({ error: 'Invalid request parameters' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { audio, format, language } = validationResult.data;
    
    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ElevenLabs API key not configured');
    }

    // Validate audio size (100MB limit for ElevenLabs)
    const audioSizeBytes = (audio.length * 3) / 4; // Approximate base64 decoded size
    const maxSizeBytes = 100 * 1024 * 1024; // 100MB
    
    if (audioSizeBytes > maxSizeBytes) {
      return new Response(
        JSON.stringify({ error: 'Audio file too large. Maximum size is 100MB.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Decode base64 audio
    console.log('Decoding audio data...');
    const binaryString = atob(audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Map language code for ElevenLabs (ISO 639-3)
    const languageMap: Record<string, string> = {
      'en': 'eng',
      'es': 'spa',
      'fr': 'fra',
      'de': 'deu',
      'pt': 'por',
      'it': 'ita',
    };
    const languageCode = languageMap[language] || 'eng';

    // Create form data for ElevenLabs Scribe v2
    const formData = new FormData();
    const blob = new Blob([bytes], { type: `audio/${format}` });
    formData.append('file', blob, `audio.${format}`);
    formData.append('model_id', 'scribe_v2');
    formData.append('diarize', 'true');           // Enable speaker diarization
    formData.append('tag_audio_events', 'true');  // Detect laughter, pauses, etc.
    formData.append('language_code', languageCode);

    console.log('Calling ElevenLabs Scribe v2 API with diarization...');
    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please wait a moment and try again.' }),
          {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
      
      if (response.status === 500) {
        return new Response(
          JSON.stringify({ error: 'Transcription service temporarily unavailable. Please try again in a moment.' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
      
      if (response.status === 400) {
        return new Response(
          JSON.stringify({ error: 'Audio format not supported. Please try recording again.' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
      
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('Transcription successful with diarization');

    // Process words into speaker segments
    const words: ElevenLabsWord[] = result.words || [];
    const segments = groupWordsIntoSegments(words);
    const duration = calculateDuration(words);
    const audioEvents: ElevenLabsAudioEvent[] = result.audio_events || [];

    console.log(`Processed ${segments.length} speaker segments from ${words.length} words`);

    return new Response(
      JSON.stringify({ 
        text: result.text,
        duration,
        segments: segments.map(s => ({
          id: s.id,
          start: s.start,
          end: s.end,
          text: s.text,
          speaker: s.speaker,
          speaker_id: s.speaker_id
        })),
        audio_events: audioEvents
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    const sanitized = sanitizeError(error, 'transcribe-audio');
    return new Response(
      JSON.stringify(sanitized),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
