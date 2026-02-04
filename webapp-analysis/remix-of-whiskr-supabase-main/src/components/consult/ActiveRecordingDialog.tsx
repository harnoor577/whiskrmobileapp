import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Pause, Square, Play, Mic } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { RecordingConsentDialog } from "@/components/consult/RecordingConsentDialog";
import { AtlasAvatar } from "@/components/ui/AtlasAvatar";

interface ActiveRecordingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecordingComplete: (audioBlob: Blob, duration: number) => void;
  onBack: () => void;
  patientId: string;
  patientInfo: {
    name: string;
    species: string;
    breed?: string;
  } | null;
}

export function ActiveRecordingDialog({
  open,
  onOpenChange,
  onRecordingComplete,
  onBack,
  patientId,
  patientInfo,
}: ActiveRecordingDialogProps) {
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [waveformData, setWaveformData] = useState<number[]>(new Array(40).fill(10));
  const [isStarting, setIsStarting] = useState(false);
  const [showConsentDialog, setShowConsentDialog] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const isRecordingRef = useRef(false);
  const isPausedRef = useRef(false);

  // Reset state when dialog opens - show consent first
  useEffect(() => {
    if (open) {
      setIsRecording(false);
      setIsPaused(false);
      setElapsedTime(0);
      setWaveformData(new Array(40).fill(10));
      setIsStarting(false);
      setShowConsentDialog(true);
      audioChunksRef.current = [];
    } else {
      // Cleanup when dialog closes
      stopRecording(false);
      setShowConsentDialog(false);
    }
  }, [open]);

  const handleConsentAgree = () => {
    setShowConsentDialog(false);
    // Call immediately within user gesture to preserve browser audio permissions
    startRecording();
  };

  const handleConsentCancel = () => {
    setShowConsentDialog(false);
    onBack();
  };

  // Timer effect
  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording, isPaused]);

  // Waveform animation - uses refs to avoid stale closure issues
  const updateWaveform = useCallback(() => {
    // Use refs for current state to avoid stale closures in requestAnimationFrame loop
    if (!analyserRef.current || !isRecordingRef.current || isPausedRef.current) {
      // Generate idle animation
      setWaveformData((prev) => prev.map(() => Math.random() * 10 + 5));
      animationRef.current = requestAnimationFrame(updateWaveform);
      return;
    }

    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    // Sample the frequency data to get waveform bars
    const bars = 40;
    const step = Math.floor(dataArray.length / bars);
    const newWaveform = [];

    for (let i = 0; i < bars; i++) {
      const value = dataArray[i * step];
      // Normalize to percentage height (10-100)
      newWaveform.push(Math.max(10, (value / 255) * 100));
    }

    setWaveformData(newWaveform);
    animationRef.current = requestAnimationFrame(updateWaveform);
  }, []); // Empty deps - uses refs for all dynamic values

  useEffect(() => {
    if (open) {
      animationRef.current = requestAnimationFrame(updateWaveform);
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [open, updateWaveform]);

  const startRecording = async () => {
    setIsStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Set up audio analysis for waveform
      audioContextRef.current = new AudioContext();

      // Resume AudioContext - required by modern browsers due to autoplay policies
      if (audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume();
      }

      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;

      // Store source node in ref to prevent garbage collection
      sourceNodeRef.current = audioContextRef.current.createMediaStreamSource(stream);
      sourceNodeRef.current.connect(analyserRef.current);

      // Set up media recorder
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      isRecordingRef.current = true; // Update ref for animation loop
      setIsStarting(false);
    } catch (error: any) {
      console.error("Error starting recording:", error);
      toast({
        title: "Microphone Access Required",
        description: "Please allow microphone access to record.",
        variant: "destructive",
      });
      setIsStarting(false);
      onBack();
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
        setIsPaused(false);
        isPausedRef.current = false;
      } else {
        mediaRecorderRef.current.pause();
        setIsPaused(true);
        isPausedRef.current = true;
      }
    }
  };

  const stopRecording = (shouldComplete = true) => {
    if (mediaRecorderRef.current && isRecording) {
      // Request any remaining buffered data before stopping
      if (mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.requestData();
      }

      mediaRecorderRef.current.stop();

      if (shouldComplete) {
        mediaRecorderRef.current.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, {
            type: mediaRecorderRef.current?.mimeType || "audio/webm",
          });

          // Validate blob has actual audio content (at least 1KB)
          if (audioBlob.size < 1024) {
            toast({
              title: "Recording too short",
              description: "No audio was captured. Please try recording again for a longer duration.",
              variant: "destructive",
            });
            onBack();
            return;
          }

          onRecordingComplete(audioBlob, elapsedTime);
        };
      }
    }

    // Update refs for animation loop
    isRecordingRef.current = false;
    isPausedRef.current = false;

    // Cleanup source node
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }

    // Cleanup stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setIsRecording(false);
    setIsPaused(false);
  };

  const handleBack = () => {
    stopRecording(false);
    onBack();
  };

  const handleStopRecording = () => {
    if (elapsedTime < 3) {
      toast({
        title: "Recording too short",
        description: "Please record for at least 3 seconds.",
        variant: "destructive",
      });
      return;
    }
    stopRecording(true);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <>
      <RecordingConsentDialog open={showConsentDialog} onAgree={handleConsentAgree} onCancel={handleConsentCancel} />
      <Dialog open={open && !showConsentDialog} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px] max-w-[95vw] p-0 overflow-hidden gap-0">
          {/* Header */}
          <div className="flex items-center gap-3 p-4 border-b">
            <Button variant="ghost" size="icon" onClick={handleBack} className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <DialogTitle className="text-lg font-semibold">Active Recording</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Patient ID: {patientId}
                {patientInfo && ` - ${patientInfo.name} (${patientInfo.species})`}
              </p>
            </div>
          </div>

          {/* Instructions Section - At Top */}
          <div className="p-4 sm:p-5 bg-card border-b">
            <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
              <Mic className="h-4 w-4 text-primary" />
              Instructions for Best Results
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              For optimal results, please verbally include the following details in your recording:{" "}
              <span className="text-primary font-medium">Presenting Complaint</span>,{" "}
              <span className="text-primary font-medium">Vitals</span>,{" "}
              <span className="text-primary font-medium">Physical Examination</span>,{" "}
              <span className="text-primary font-medium">Diagnostics</span>, and{" "}
              <span className="text-primary font-medium">Owner's Constraints</span>.
            </p>
          </div>

          {/* Recording Area */}
          <div className="p-4 sm:p-8 bg-muted/30">
            <div className="flex flex-col items-center">
              {/* Atlas Avatar */}
              <div className="mb-4">
                <AtlasAvatar
                  state={isStarting ? "processing" : isPaused ? "idle" : isRecording ? "recording" : "idle"}
                  size="lg"
                  showRings={true}
                />
              </div>

              {/* Timer */}
              <div className="text-4xl sm:text-6xl font-light tracking-tight text-foreground mb-4 sm:mb-6 font-mono animate-scale-in">
                {formatTime(elapsedTime)}
              </div>

              {/* Waveform Visualization */}
              <div
                className="flex items-center justify-center gap-[2px] sm:gap-[3px] h-16 sm:h-20 mb-6 sm:mb-8 w-full max-w-full overflow-hidden animate-fade-in"
                style={{ animationDelay: "200ms" }}
              >
                {waveformData.map((height, index) => (
                  <div
                    key={index}
                    className={`w-[3px] sm:w-[4px] rounded-full transition-all duration-75 ${
                      isPaused ? "bg-yellow-500/60" : "bg-primary"
                    }`}
                    style={{
                      height: `${height}%`,
                      opacity: 0.4 + (height / 100) * 0.6,
                    }}
                  />
                ))}
              </div>

              {/* Control Buttons */}
              <div
                className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 w-full sm:w-auto animate-fade-in"
                style={{ animationDelay: "300ms" }}
              >
                <Button
                  variant="outline"
                  size="lg"
                  onClick={pauseRecording}
                  disabled={!isRecording || isStarting}
                  className="gap-2 px-4 sm:px-6 w-full sm:w-auto"
                >
                  {isPaused ? (
                    <>
                      <Play className="h-4 w-4" />
                      Resume
                    </>
                  ) : (
                    <>
                      <Pause className="h-4 w-4" />
                      Pause
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleStopRecording}
                  disabled={!isRecording || isStarting}
                  className="gap-2 px-4 sm:px-6 w-full sm:w-auto border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Square className="h-4 w-4 fill-current" />
                  Stop
                </Button>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="h-1 bg-primary/20">
            <div
              className="h-full bg-primary transition-all duration-1000"
              style={{ width: `${Math.min((elapsedTime / 300) * 100, 100)}%` }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
