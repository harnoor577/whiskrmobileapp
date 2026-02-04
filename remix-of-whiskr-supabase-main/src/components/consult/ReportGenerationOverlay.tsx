import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { AtlasEye } from "@/components/ui/AtlasEye";
interface ReportGenerationOverlayProps {
  isVisible: boolean;
  reportType: "soap" | "wellness" | "procedure" | null;
  isGenerationComplete?: boolean;
  onAgree?: () => void;
}

const statusMessages = {
  soap: [
    "Transcribing your recording...",
    "Processing audio content...",
    "Analyzing clinical findings...",
    "Extracting subjective history...",
    "Processing objective data...",
    "Formulating assessment...",
    "Generating treatment plan...",
    "Formatting SOAP notes...",
    "Almost ready...",
  ],
  wellness: [
    "Analyzing wellness data...",
    "Reviewing preventive care...",
    "Processing vital signs...",
    "Evaluating nutrition plan...",
    "Generating recommendations...",
    "Formatting wellness report...",
    "Almost ready...",
  ],
  procedure: [
    "Analyzing procedure details...",
    "Extracting pre-op findings...",
    "Processing surgical notes...",
    "Documenting complications...",
    "Generating recovery plan...",
    "Formatting procedural notes...",
    "Almost ready...",
  ],
};

const reportTitles = {
  soap: "SOAP Notes",
  wellness: "Wellness Report",
  procedure: "Procedural Notes",
};

export function ReportGenerationOverlay({
  isVisible,
  reportType,
  isGenerationComplete = false,
  onAgree,
}: ReportGenerationOverlayProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [dots, setDots] = useState("");

  useEffect(() => {
    if (!isVisible || !reportType) {
      setMessageIndex(0);
      return;
    }

    // Rotate through messages
    const messageInterval = setInterval(() => {
      setMessageIndex((prev) => {
        const messages = statusMessages[reportType];
        return prev < messages.length - 1 ? prev + 1 : prev;
      });
    }, 2500);

    // Animate dots
    const dotsInterval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 400);

    return () => {
      clearInterval(messageInterval);
      clearInterval(dotsInterval);
    };
  }, [isVisible, reportType]);

  if (!isVisible || !reportType) return null;

  const currentMessage = isGenerationComplete ? "Report ready!" : statusMessages[reportType][messageIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in">
      <Card className="w-full max-w-lg mx-4 p-8 bg-card border-border shadow-2xl">
        <div className="flex flex-col items-center text-center space-y-6">
          {/* Animated Atlas Eye */}
          <AtlasEye 
            size="lg" 
            wander={!isGenerationComplete}
            blink={true}
            glowIntensity="high"
          />

          {/* Title */}
          <div>
            <h2 className="text-xl font-semibold text-foreground mb-1">Generating {reportTitles[reportType]}</h2>
            <p className="text-sm text-muted-foreground">Atlas is analyzing your consultation</p>
          </div>

          {/* Progress Indicator */}
          <div className="w-full space-y-4">
            {/* Animated Progress Bar */}
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isGenerationComplete ? "bg-primary w-full" : "bg-gradient-to-r from-primary via-accent to-primary"
                }`}
                style={
                  isGenerationComplete
                    ? {}
                    : {
                        width: "100%",
                        animation: "shimmer 1.5s ease-in-out infinite",
                        backgroundSize: "200% 100%",
                      }
                }
              />
            </div>

            {/* Status Message */}
            <div className="min-h-[24px] flex items-center justify-center">
              <p
                className={`text-sm font-medium animate-fade-in ${
                  isGenerationComplete ? "text-primary" : "text-primary"
                }`}
                key={messageIndex}
              >
                {currentMessage}
                {!isGenerationComplete && <span className="inline-block w-6 text-left">{dots}</span>}
              </p>
            </div>
          </div>

          {/* Disclaimer Box */}
          <div className="w-full bg-muted/50 border border-border rounded-lg p-2 sm:p-4 text-left">
            <div className="flex items-start gap-2 sm:gap-3">
              <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs sm:text-sm font-medium text-foreground mb-1 sm:mb-2">Disclaimer:</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground leading-snug sm:leading-relaxed">
                  The information and content provided are generated for educational and informational purposes only.
                  They are not intended to replace professional judgment, diagnosis, or treatment. The output should not
                  be used as a substitute for advice from a qualified professional. Always consult an appropriately
                  licensed or certified professional for specific questions or concerns related to this subject matter.
                </p>
              </div>
            </div>
          </div>

          {/* Agree Button */}
          <Button onClick={onAgree} disabled={!isGenerationComplete} className="w-full" size="lg">
            {isGenerationComplete ? "I Agree & Continue" : "Please wait..."}
          </Button>

          {/* Paw Print Animation - only show while generating */}
          {!isGenerationComplete && (
            <div className="flex items-center justify-center gap-3 opacity-50">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-3 w-3 rounded-full bg-primary"
                  style={{
                    animation: `pulse 1.5s ease-in-out infinite`,
                    animationDelay: `${i * 0.3}s`,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </Card>

      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  );
}
