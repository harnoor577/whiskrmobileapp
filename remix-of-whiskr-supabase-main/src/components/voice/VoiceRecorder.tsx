import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Mic, Square, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { transcribeAudio } from '@/utils/audioProcessing';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { RecordingConsentDialog } from '@/components/consult/RecordingConsentDialog';

interface VoiceRecorderProps {
  onTranscriptionComplete: (text: string) => void;
  onError: (error: string) => void;
  isDisabled?: boolean;
  maxDuration?: number;
  consultId?: string;
  inline?: boolean;
  isRecording?: boolean;
  onRecordingChange?: (recording: boolean) => void;
  overlayContainerId?: string; // element id where expanded UI will render
}

export function VoiceRecorder({ 
  onTranscriptionComplete, 
  onError, 
  isDisabled = false,
  maxDuration = 900, // 15 minutes
  consultId,
  inline = false,
  isRecording: externalIsRecording,
  onRecordingChange,
  overlayContainerId = 'recording-overlay-slot',
}: VoiceRecorderProps) {
  const [internalIsRecording, setInternalIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [waveformData, setWaveformData] = useState<number[]>(new Array(100).fill(0));
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  
  // Use external state if provided, otherwise use internal state
  const isRecording = externalIsRecording !== undefined ? externalIsRecording : internalIsRecording;
  const setIsRecording = (value: boolean) => {
    if (onRecordingChange) {
      onRecordingChange(value);
    } else {
      setInternalIsRecording(value);
    }
  };
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recordingMimeTypeRef = useRef<string>('audio/webm');
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  const { toast } = useToast();

  useEffect(() => {
    return () => {
      stopRecording();
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 48000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Set recording state immediately
      setIsRecording(true);
      setDuration(0);

      // Setup audio visualization
      audioContextRef.current = new AudioContext();
      
      // Resume AudioContext - required by modern browsers due to autoplay policies
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      analyserRef.current = audioContextRef.current.createAnalyser();
      // Store source node in ref to prevent garbage collection
      sourceNodeRef.current = audioContextRef.current.createMediaStreamSource(stream);
      sourceNodeRef.current.connect(analyserRef.current);
      analyserRef.current.fftSize = 512; // 512 gives 256 frequency bins for 200 bars
      
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      
      const updateAudioLevel = () => {
        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray);
          // Safe reduce with initial value
          const average = dataArray.length > 0 
            ? dataArray.reduce((a, b) => a + b, 0) / dataArray.length 
            : 0;
          // Boost sensitivity for quiet exam room conversations (2.5x amplification)
          const boostedLevel = Math.min(255, average * 2.5);
          setAudioLevel(boostedLevel);
          
          // Create waveform bars - 100 bars for mobile-friendly display
          const bars = 100;
          const barData: number[] = [];
          const binSize = Math.max(1, Math.floor(dataArray.length / bars));
          
          for (let i = 0; i < bars; i++) {
            const startBin = i * binSize;
            const endBin = Math.min(startBin + binSize, dataArray.length);
            const sliceData = dataArray.slice(startBin, endBin);
            // Safe reduce with initial value
            const barAverage = sliceData.length > 0 
              ? sliceData.reduce((a, b) => a + b, 0) / sliceData.length 
              : 0;
            // Boost and normalize to 0-100 range
            const boosted = Math.min(100, (barAverage / 255) * 100 * 2.5);
            barData.push(boosted);
          }
          
          setWaveformData(barData);
          animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
        }
      };
      updateAudioLevel();

      // Setup MediaRecorder - try multiple formats in order of preference
      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
        mimeType = 'audio/ogg;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      }
      
      recordingMimeTypeRef.current = mimeType;
      console.log('Recording with MIME type:', mimeType);

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        // Cleanup source node
        if (sourceNodeRef.current) {
          sourceNodeRef.current.disconnect();
          sourceNodeRef.current = null;
        }
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }
        await processRecording();
      };

      mediaRecorder.start(1000); // Collect data every second

      // Start timer
      timerRef.current = setInterval(() => {
        setDuration((prev) => {
          const newDuration = prev + 1;
          if (newDuration >= maxDuration) {
            stopRecording();
            toast({
              title: 'Recording stopped',
              description: `Maximum duration of ${maxDuration} seconds reached`,
            });
          }
          return newDuration;
        });
      }, 1000);

    } catch (error: any) {
      console.error('Error starting recording:', error);
      let errorMessage = 'Failed to start recording';
      
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Microphone access denied. Please allow access in your browser settings.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No microphone detected. Please connect a microphone and try again.';
      }
      
      onError(errorMessage);
      toast({
        variant: 'destructive',
        title: 'Recording Error',
        description: errorMessage,
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      // Request remaining buffered data before stopping
      if (mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.requestData();
      }
      
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setAudioLevel(0);
      setWaveformData([0, 0, 0, 0, 0, 0, 0, 0]);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }
  };

  const processRecording = async () => {
    if (audioChunksRef.current.length === 0) {
      onError('No audio data recorded');
      return;
    }

    // Use the actual MIME type that was used for recording
    const audioBlob = new Blob(audioChunksRef.current, { type: recordingMimeTypeRef.current });
    console.log('Processing audio blob:', { 
      size: audioBlob.size, 
      type: audioBlob.type 
    });
    
    // Validate blob has actual audio content
    if (audioBlob.size < 1024) {
      onError('Recording too short. Please record for a longer duration.');
      toast({
        variant: 'destructive',
        title: 'Recording Error',
        description: 'Recording was too short to capture audio. Please try again.',
      });
      setDuration(0);
      audioChunksRef.current = [];
      return;
    }

    setIsTranscribing(true);

    try {
      const result = await transcribeAudio(audioBlob, consultId);
      
      // Pass the full text to the callback - segments are handled at a higher level
      onTranscriptionComplete(result.text);
      
      toast({
        title: 'Transcription complete',
        description: result.segments?.length 
          ? `Detected ${result.segments.length} speaker segments`
          : 'Your voice has been converted to text',
      });
    } catch (error: any) {
      console.error('Transcription error:', error);
      const errorMessage = error.message || 'Failed to transcribe audio';
      onError(errorMessage);
      toast({
        variant: 'destructive',
        title: 'Transcription Error',
        description: errorMessage,
      });
    } finally {
      setIsTranscribing(false);
      setDuration(0);
      audioChunksRef.current = [];
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isTranscribing) {
    if (inline) {
      return (
        <Button variant="outline" size="icon" disabled>
          <Loader2 className="w-4 h-4 animate-spin" />
        </Button>
      );
    }
    return null;
  }

  // Expanded UI (used in portal when recording) - compact h-10 to match text input
  const expandedUI = (
    <div className="flex items-center gap-2 w-full animate-fade-in">
      {/* Compact teal recording bar - same height as input (h-10) */}
      <div className="flex-1 flex items-center gap-3 px-3 h-10 bg-accent rounded-md overflow-hidden min-w-0">
        {/* Recording indicator dots */}
        <div className="flex gap-1">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
        
        {/* Compact waveform - 100 thin dancing lines */}
        <div className="flex items-center h-6 flex-1 min-w-0 overflow-hidden">
          {waveformData.map((level, i) => (
            <div
              key={i}
              className="flex-1 min-w-[1px] bg-white rounded-full transition-all duration-75 ease-out"
              style={{ 
                height: `${Math.max(20, level)}%`,
                opacity: level > 5 ? 1 : 0.4
              }}
            />
          ))}
        </div>
        
        {/* Timer */}
        <span className="text-sm font-medium text-white tabular-nums">
          {formatTime(duration)}
        </span>
      </div>
      
      {/* Compact stop button - same height as input */}
      <Button
        variant="secondary"
        size="icon"
        className="h-10 w-10 rounded-md bg-white text-accent hover:bg-white/90"
        onClick={stopRecording}
      >
        <Square className="w-4 h-4 fill-current" />
      </Button>
    </div>
  );

  if (isRecording) {
    const container = typeof document !== 'undefined' ? document.getElementById(overlayContainerId) : null;
    const portal = container ? createPortal(expandedUI, container) : expandedUI;
    // Hide inline button, render overlay via portal
    return inline ? portal : expandedUI;
  }

  // Default inline trigger (visible when not recording)
  if (inline) {
    return (
      <>
        <RecordingConsentDialog
          open={showConsentDialog}
          onAgree={() => {
            setShowConsentDialog(false);
            startRecording();
          }}
          onCancel={() => setShowConsentDialog(false)}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              onClick={() => setShowConsentDialog(true)}
              disabled={isDisabled}
              className="h-9 w-9 rounded-full bg-primary hover:bg-primary/90 transition-all hover:scale-105 shrink-0"
            >
              <Mic className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-semibold">Start Voice Recording</p>
          </TooltipContent>
        </Tooltip>
      </>
    );
  }

  return null;
}
