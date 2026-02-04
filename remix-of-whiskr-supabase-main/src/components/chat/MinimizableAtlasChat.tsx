import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Loader2, Minus, Copy, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AtlasEye } from "@/components/ui/AtlasEye";
import { useAuth } from "@/lib/auth";
import { stripMarkdown } from "@/utils/stripMarkdown";
import { VoiceRecorder } from "@/components/voice/VoiceRecorder";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface MinimizableAtlasChatProps {
  transcription: string | null;
  isTranscribing?: boolean;
  patientInfo: {
    patientId: string;
    name: string;
    species: string;
  } | null;
  consultId: string;
  inline?: boolean;
  instanceId?: string;
  autoOpen?: boolean;
  readOnly?: boolean;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface DifferentialItem {
  name: string;
  reason?: string;
  treatmentPlan?: string;
  isLoading?: boolean;
}

export function MinimizableAtlasChat({
  transcription,
  isTranscribing = false,
  patientInfo,
  consultId,
  inline = false,
  instanceId,
  autoOpen = true,
  readOnly = false,
}: MinimizableAtlasChatProps) {
  const overlayId = `atlas-recording-overlay-${instanceId || consultId}`;
  const { clinicId } = useAuth();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(inline);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const [hasAutoOpened, setHasAutoOpened] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Expandable card states
  const [caseSummaryOpen, setCaseSummaryOpen] = useState(false);
  const [differentialsOpen, setDifferentialsOpen] = useState(false);
  const [differentials, setDifferentials] = useState<DifferentialItem[]>([]);
  const [selectedDifferential, setSelectedDifferential] = useState<string | null>(null);
  const [differentialsLoaded, setDifferentialsLoaded] = useState(false);
  const [differentialsLoading, setDifferentialsLoading] = useState(false);

  const copyToCaseNotes = async (content: string) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !clinicId) throw new Error("Not authenticated");

      const strippedContent = stripMarkdown(content);

      const { error } = await supabase.from("case_notes").insert({
        consult_id: consultId,
        clinic_id: clinicId,
        note: strippedContent,
        created_by: user.id,
      });

      if (error) throw error;

      await supabase.functions.invoke("process-case-note", {
        body: { consultId, note: strippedContent },
      });

      toast({
        title: "Added to Case Notes",
        description: "Atlas output saved to case notes.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save to case notes",
      });
    }
  };

  const handleVoiceTranscription = async (text: string) => {
    if (!text.trim()) return;
    setShowSuggestions(false);
    await sendMessageWithContent(text);
  };

  const handleVoiceError = (error: string) => {
    console.error("Voice transcription error:", error);
  };

  // Parse differentials from the AI response
  const parseDifferentials = (analysisContent: string) => {
    const lines = analysisContent.split('\n');
    const differentialsList: DifferentialItem[] = [];
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Look for numbered items (1. 2. 3.) which is how AI formats differentials
      const numberedMatch = trimmedLine.match(/^(\d+)\.\s*\**([^:*\n]+)\**/);
      if (numberedMatch) {
        const name = numberedMatch[2].replace(/[*_]/g, '').trim();
        if (name && name.length > 2 && name.length < 100 && !differentialsList.some(d => d.name.toLowerCase() === name.toLowerCase())) {
          differentialsList.push({ name });
        }
        continue;
      }
      
      // Also look for bullet points
      const bulletMatch = trimmedLine.match(/^[\-\*\•]\s*\**([^:*\n]+)\**/);
      if (bulletMatch) {
        const name = bulletMatch[1].replace(/[*_]/g, '').trim();
        if (name && name.length > 2 && name.length < 100 && !differentialsList.some(d => d.name.toLowerCase() === name.toLowerCase())) {
          differentialsList.push({ name });
        }
      }
    }
    
    return differentialsList.slice(0, 5); // Limit to 5 differentials
  };

  // Fetch differentials on-demand when user expands the card
  const fetchDifferentials = async () => {
    if (differentialsLoading || differentialsLoaded) return;
    
    setDifferentialsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-recording", {
        body: {
          transcription,
          patientInfo,
          consultId,
          followUpQuestion: "Based on this case, please provide your top 3-5 differential diagnoses. Format each as a numbered list (1. 2. 3. etc.) with just the condition name on each line.",
          previousMessages: messages,
        },
      });

      if (error) throw error;
      
      if (data?.analysis) {
        const parsed = parseDifferentials(data.analysis);
        setDifferentials(parsed);
        setDifferentialsLoaded(true);
      }
    } catch (error) {
      console.error("Error fetching differentials:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to analyze differentials. Please try again.",
      });
    } finally {
      setDifferentialsLoading(false);
    }
  };

  // Auto-analyze when transcription is ready (skip in readOnly mode)
  useEffect(() => {
    if (readOnly) return;
    if (transcription && messages.length === 0 && !isAnalyzing) {
      analyzeCase();
    }
  }, [transcription, readOnly]);

  // Load existing messages when in readOnly mode
  useEffect(() => {
    if (!readOnly) return;
    
    const loadExistingMessages = async () => {
      setIsAnalyzing(true);
      try {
        const { data, error } = await supabase
          .from("chat_messages")
          .select("id, role, content, created_at")
          .eq("consult_id", consultId)
          .order("created_at", { ascending: true });

        if (!error && data && data.length > 0) {
          const formattedMessages: Message[] = data
            .filter(m => m.role !== "system")
            .map(m => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
            }));
          setMessages(formattedMessages);
          setShowSuggestions(true);
        }
      } catch (error) {
        console.error("Error loading messages:", error);
      } finally {
        setIsAnalyzing(false);
      }
    };

    loadExistingMessages();
  }, [readOnly, consultId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-open when initial analysis completes with suggestions (if autoOpen is enabled)
  useEffect(() => {
    if (autoOpen && messages.length > 0 && showSuggestions && !hasAutoOpened) {
      setIsOpen(true);
      setHasAutoOpened(true);
    }
  }, [autoOpen, messages.length, showSuggestions, hasAutoOpened]);

  // Flash notification when new message arrives while minimized
  useEffect(() => {
    if (!isOpen && messages.length > 0) {
      setHasNewMessage(true);
    }
  }, [messages.length]);

  // Clear notification when opened
  useEffect(() => {
    if (isOpen) {
      setHasNewMessage(false);
    }
  }, [isOpen]);

  const saveMessageToDb = async (role: "user" | "assistant", content: string) => {
    if (!clinicId) return;

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    await supabase.from("chat_messages").insert({
      consult_id: consultId,
      clinic_id: clinicId,
      user_id: userData.user.id,
      role,
      content,
    });
  };

  const analyzeCase = async () => {
    if (!transcription) return;
    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-recording", {
        body: {
          transcription,
          patientInfo,
          consultId,
        },
      });
      if (error) throw error;
      if (data?.analysis) {
        setMessages([
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: data.analysis,
          },
        ]);
        await saveMessageToDb("assistant", data.analysis);
        setShowSuggestions(true);
        // Differentials will be fetched on-demand when user expands the card
      }
    } catch (error) {
      console.error("Analysis error:", error);
      const errorMessage =
        "I'm having trouble analyzing this case right now. Feel free to ask me any questions about the recording, and I'll do my best to help!";
      setMessages([
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: errorMessage,
        },
      ]);
      await saveMessageToDb("assistant", errorMessage);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const fetchDifferentialDetails = async (differentialName: string) => {
    // Update the differential to show loading state
    setDifferentials(prev => 
      prev.map(d => d.name === differentialName ? { ...d, isLoading: true } : d)
    );
    setSelectedDifferential(differentialName);

    try {
      const { data, error } = await supabase.functions.invoke("analyze-recording", {
        body: {
          transcription,
          patientInfo,
          consultId,
          followUpQuestion: `For the differential diagnosis "${differentialName}" based on this case:

1. REASON: Explain why this is being considered as a differential (what clinical signs, history, or findings support this diagnosis).

2. TREATMENT PLAN: Provide a general treatment plan including recommended diagnostics, medications, and monitoring.

Please format your response with clear "REASON:" and "TREATMENT PLAN:" sections.`,
          previousMessages: messages,
        },
      });

      if (error) throw error;

      // Parse response to extract reason and treatment plan
      const response = data?.analysis || "";
      const reasonMatch = response.match(/REASON:?\s*([\s\S]*?)(?=TREATMENT PLAN:|$)/i);
      const treatmentMatch = response.match(/TREATMENT PLAN:?\s*([\s\S]*?)$/i);

      setDifferentials(prev =>
        prev.map(d =>
          d.name === differentialName
            ? { 
                ...d, 
                reason: reasonMatch?.[1]?.trim() || "Clinical findings support this diagnosis.",
                treatmentPlan: treatmentMatch?.[1]?.trim() || response,
                isLoading: false 
              }
            : d
        )
      );
    } catch (error) {
      console.error("Error fetching differential details:", error);
      setDifferentials(prev =>
        prev.map(d =>
          d.name === differentialName
            ? { ...d, reason: "Unable to load reasoning.", treatmentPlan: "Failed to load treatment plan.", isLoading: false }
            : d
        )
      );
    }
  };

  const sendMessageWithContent = async (content: string) => {
    if (isLoading) return;
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: content,
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    await saveMessageToDb("user", userMessage.content);

    try {
      const { data, error } = await supabase.functions.invoke("analyze-recording", {
        body: {
          transcription,
          patientInfo,
          consultId,
          followUpQuestion: userMessage.content,
          previousMessages: messages,
        },
      });
      if (error) throw error;
      if (data?.analysis) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: data.analysis,
          },
        ]);
        await saveMessageToDb("assistant", data.analysis);
      }
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage = "I'm sorry, I couldn't process that. Please try again.";
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: errorMessage,
        },
      ]);
      await saveMessageToDb("assistant", errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    setShowSuggestions(false);
    const content = input.trim();
    setInput("");
    await sendMessageWithContent(content);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Get label text based on state
  const getMinimizedLabel = () => {
    if (isTranscribing) return "Processing...";
    if (isAnalyzing) return "Analyzing...";
    if (messages.length > 0 && showSuggestions) return "Tap for suggestions";
    if (messages.length > 0) return "Case ready";
    return "Ask Atlas";
  };

  // Get case summary content (first assistant message)
  const getCaseSummaryContent = () => {
    const firstAssistantMessage = messages.find(m => m.role === "assistant");
    return firstAssistantMessage ? stripMarkdown(firstAssistantMessage.content) : "";
  };

  // Render expandable suggestion cards
  const renderSuggestionCards = () => {
    if (!showSuggestions || isLoading) return null;

    const caseSummary = getCaseSummaryContent();

    return (
      <div className="space-y-2 mt-3 px-1">
        {/* Case Summary Card */}
        <Collapsible open={caseSummaryOpen} onOpenChange={setCaseSummaryOpen}>
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between p-3 rounded-lg bg-accent/10 hover:bg-accent/20 border border-accent/30 transition-colors text-left">
              <span className="font-medium text-sm text-foreground">Case Summary</span>
              {caseSummaryOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
              <p className="whitespace-pre-wrap leading-relaxed">{caseSummary}</p>
              <div className="flex justify-end mt-2 pt-2 border-t border-border/50">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1.5"
                  onClick={() => caseSummary && copyToCaseNotes(caseSummary)}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Add to Case Notes
                </Button>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Differentials Card - Always show */}
        <Collapsible 
          open={differentialsOpen} 
          onOpenChange={(open) => {
            setDifferentialsOpen(open);
            // Fetch differentials when card is first opened
            if (open && !differentialsLoaded && !differentialsLoading) {
              fetchDifferentials();
            }
          }}
        >
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between p-3 rounded-lg bg-accent/10 hover:bg-accent/20 border border-accent/30 transition-colors text-left">
              <span className="font-medium text-sm text-foreground">Differentials</span>
              {differentialsLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : differentialsOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            {differentialsLoading ? (
              <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Analyzing differentials...</span>
              </div>
            ) : differentials.length > 0 ? (
              <div className="space-y-2">
                {differentials.map((diff) => (
                  <div key={diff.name} className="rounded-lg border border-border/50 overflow-hidden">
                    <button
                      onClick={() => {
                        if (!diff.reason && !diff.treatmentPlan && !diff.isLoading) {
                          fetchDifferentialDetails(diff.name);
                        } else {
                          setSelectedDifferential(
                            selectedDifferential === diff.name ? null : diff.name
                          );
                        }
                      }}
                      className="w-full flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                    >
                      <span className="text-sm font-medium text-foreground">{diff.name}</span>
                      {diff.isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (diff.reason || diff.treatmentPlan) ? (
                        selectedDifferential === diff.name ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">Tap for details</span>
                      )}
                    </button>
                    {(diff.reason || diff.treatmentPlan) && selectedDifferential === diff.name && (
                      <div className="p-3 bg-muted/20 border-t border-border/50 space-y-3">
                        {/* Reason Section */}
                        {diff.reason && (
                          <div>
                            <h4 className="text-xs font-semibold text-accent uppercase tracking-wide mb-1">
                              Why this differential?
                            </h4>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                              {stripMarkdown(diff.reason)}
                            </p>
                          </div>
                        )}
                        
                        {/* Treatment Plan Section */}
                        {diff.treatmentPlan && (
                          <div>
                            <h4 className="text-xs font-semibold text-accent uppercase tracking-wide mb-1">
                              Treatment Plan
                            </h4>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                              {stripMarkdown(diff.treatmentPlan)}
                            </p>
                          </div>
                        )}
                        <div className="flex justify-end pt-2 border-t border-border/50">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1.5"
                            onClick={() => {
                              const content = `${diff.name}\n\nReason: ${diff.reason || ''}\n\nTreatment Plan: ${diff.treatmentPlan || ''}`;
                              copyToCaseNotes(content);
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                            Add to Case Notes
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                Expand to analyze differentials for this case.
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>
    );
  };

  // Floating button when minimized (skip if inline mode)
  if (!isOpen && !inline) {
    return (
      <div className="fixed right-4 z-50 flex flex-col items-center gap-1.5 floating-above-nav lg:bottom-4">
        <button onClick={() => setIsOpen(true)} className="group relative">
          <div
            className={`relative h-14 w-14 rounded-full bg-accent shadow-lg flex items-center justify-center overflow-hidden transition-transform hover:scale-110 ${hasNewMessage ? "animate-pulse ring-4 ring-accent/50" : ""}`}
          >
            <AtlasEye size="sm" wander blink glowIntensity="medium" />
            {/* Processing indicator */}
            {(isTranscribing || isAnalyzing) && (
              <div className="absolute inset-0 bg-accent/80 flex items-center justify-center">
                <Loader2 className="h-5 w-5 text-white animate-spin" />
              </div>
            )}
          </div>
          {/* Message count badge */}
          {messages.length > 0 && !isTranscribing && !isAnalyzing && (
            <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
              {messages.length}
            </div>
          )}
        </button>
        {/* Persistent label */}
        <span className="text-xs font-medium text-muted-foreground bg-background/95 px-2.5 py-1 rounded-full shadow-sm border whitespace-nowrap">
          {getMinimizedLabel()}
        </span>
      </div>
    );
  }

  // Inline mode: full-width, always open
  if (inline) {
    return (
      <div className="w-full h-full bg-card rounded-xl border border-border shadow-sm flex flex-col">
        {/* Header - Compact */}
        <div className="p-2 md:p-3 flex items-center gap-2 bg-accent shrink-0 rounded-t-xl">
          <div className="h-7 w-7 md:h-8 md:w-8 rounded-full bg-white/20 flex items-center justify-center overflow-hidden">
            <AtlasEye size="xs" blink glowIntensity="low" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-primary-foreground text-sm">Atlas</h2>
          </div>
        </div>

        {/* Chat Area */}
        <ScrollArea className="flex-1 p-3 md:p-4 min-h-0" ref={scrollRef}>
          {/* Initial Loading State */}
          {(isTranscribing || isAnalyzing) && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 animate-fade-in">
              <div className="relative mb-4">
                <AtlasEye size="lg" wander blink glowIntensity="high" />
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2">
                  <div className="flex gap-1">
                    <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div
                      className="h-2 w-2 rounded-full bg-primary animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <div
                      className="h-2 w-2 rounded-full bg-primary animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                </div>
              </div>
              <p className="text-muted-foreground text-center text-sm mt-2">
                {isTranscribing ? "Processing your recording..." : readOnly ? "Loading conversation..." : "Analyzing the case..."}
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">{readOnly ? "Fetching saved messages" : "Atlas is reviewing the details"}</p>
            </div>
          )}

          {/* Empty state for readOnly mode */}
          {readOnly && messages.length === 0 && !isAnalyzing && (
            <div className="flex flex-col items-center justify-center py-8">
              <AtlasEye size="sm" blink className="opacity-50 mb-2" />
              <p className="text-muted-foreground text-sm">No AI conversation for this consult.</p>
            </div>
          )}

          {/* Suggestion Cards (replaces flat suggestion bubbles) */}
          {messages.length > 0 && renderSuggestionCards()}

          {/* Loading indicator for follow-up */}
          {isLoading && (
            <div className="flex justify-start mt-3">
              <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-2.5">
                <div className="flex gap-1">
                  <div
                    className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <div
                    className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <div
                    className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </div>
            </div>
          )}
        </ScrollArea>

        {/* Input Area - hide in readOnly mode */}
        {!readOnly && (
          <div className="p-3 border-t border-border bg-card shrink-0">
            {/* Recording overlay mount point */}
            <div id={overlayId} />

            <div className="flex gap-2 items-center">
              {/* Only show input when NOT recording */}
              {!isRecording && (
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask Atlas a question..."
                  disabled={isLoading || isTranscribing || isAnalyzing}
                  className="flex-1 text-sm"
                />
              )}

              {/* SAME VoiceRecorder instance - always mounted */}
              <VoiceRecorder
                onTranscriptionComplete={handleVoiceTranscription}
                onError={handleVoiceError}
                isDisabled={isLoading || isTranscribing || isAnalyzing}
                isRecording={isRecording}
                onRecordingChange={setIsRecording}
                inline={true}
                consultId={consultId}
                overlayContainerId={overlayId}
              />

              {/* Only show send button when NOT recording */}
              {!isRecording && (
                <Button
                  onClick={sendMessage}
                  disabled={!input.trim() || isLoading || isTranscribing || isAnalyzing}
                  size="icon"
                  className="bg-accent"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Expanded popup chat (floating mode)
  return (
    <div className="fixed right-6 z-50 w-[420px] max-w-[calc(100vw-3rem)] h-[600px] max-h-[70vh] bg-card rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden animate-scale-in floating-above-nav lg:bottom-6">
      {/* Header - Compact */}
      <div className="p-3 flex items-center gap-2 bg-accent shrink-0">
        <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center overflow-hidden">
          <AtlasEye size="sm" blink glowIntensity="low" />
        </div>
        <div className="flex-1">
          <h2 className="font-semibold text-primary-foreground text-sm">Atlas</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen(false)}
            className="h-8 w-8 text-primary-foreground/80 hover:text-primary-foreground hover:bg-white/10"
          >
            <Minus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Chat Area */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {/* Initial Loading State */}
        {(isTranscribing || isAnalyzing) && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full py-8 animate-fade-in">
            <div className="relative mb-4">
              <AtlasEye size="lg" wander blink glowIntensity="high" />
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2">
                <div className="flex gap-1">
                  <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
            <p className="text-muted-foreground text-center text-sm mt-2">
              {isTranscribing ? "Processing your recording..." : "Analyzing the case..."}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">Atlas is reviewing the details</p>
          </div>
        )}

        {/* Suggestion Cards */}
        {messages.length > 0 && renderSuggestionCards()}

        {/* Loading indicator for follow-up */}
        {isLoading && (
          <div className="flex justify-start mt-3">
            <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-2.5">
              <div className="flex gap-1">
                <div
                  className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce"
                  style={{ animationDelay: "0ms" }}
                />
                <div
                  className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <div
                  className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            </div>
          </div>
        )}
      </ScrollArea>

      {/* Input Area */}
      <div className="p-3 border-t border-border bg-card shrink-0">
        {/* Recording overlay mount point */}
        <div id="atlas-popup-recording-overlay" />

        <div className="flex gap-2 items-center">
          {/* Only show input when NOT recording */}
          {!isRecording && (
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask Atlas a question..."
              disabled={isLoading || isTranscribing || isAnalyzing}
              className="flex-1 text-sm"
            />
          )}

          {/* SAME VoiceRecorder instance - always mounted */}
          <VoiceRecorder
            onTranscriptionComplete={handleVoiceTranscription}
            onError={handleVoiceError}
            isDisabled={isLoading || isTranscribing || isAnalyzing}
            isRecording={isRecording}
            onRecordingChange={setIsRecording}
            inline={true}
            consultId={consultId}
            overlayContainerId="atlas-popup-recording-overlay"
          />

          {/* Only show send button when NOT recording */}
          {!isRecording && (
            <Button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading || isTranscribing || isAnalyzing}
              size="icon"
              className="bg-accent"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
