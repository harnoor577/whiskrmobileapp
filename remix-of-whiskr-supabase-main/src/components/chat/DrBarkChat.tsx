import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import atlasMascot from "@/assets/whiskr-monogram.png";
import { useAuth } from "@/lib/auth";
import { stripMarkdown } from "@/utils/stripMarkdown";
import { VoiceRecorder } from "@/components/voice/VoiceRecorder";

interface DrBarkChatProps {
  transcription: string | null;
  isTranscribing: boolean;
  patientInfo: {
    patientId: string;
    name: string;
    species: string;
  } | null;
  consultId: string;
}
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const suggestions = [
  {
    id: "differential",
    label: "Suggest Differential Diagnosis & Plan",
    prompt: "Based on the case summary, please provide differential diagnoses with a diagnostic plan for each.",
  },
  {
    id: "treatment",
    label: "Suggest Treatment Plan",
    prompt: "Based on the case summary, please suggest a comprehensive treatment plan for this patient.",
  },
  {
    id: "wellness",
    label: "Suggest Wellness",
    prompt: "Based on the case summary, please suggest a wellness care plan for this patient.",
  },
  {
    id: "procedures",
    label: "Suggest Procedures",
    prompt: "Suggest the most relevant procedure for this case.",
  },
];

export function DrBarkChat({ transcription, isTranscribing, patientInfo, consultId }: DrBarkChatProps) {
  const { clinicId } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleVoiceTranscription = async (text: string) => {
    if (!text.trim()) return;
    setShowSuggestions(false);
    await sendMessageWithContent(text);
  };

  const handleVoiceError = (error: string) => {
    console.error("Voice transcription error:", error);
  };

  // Auto-analyze when transcription is ready
  useEffect(() => {
    if (transcription && messages.length === 0 && !isAnalyzing) {
      analyzeCase();
    }
  }, [transcription]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);
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
        // Save assistant message to database
        await saveMessageToDb("assistant", data.analysis);
        // Show suggestion bubbles after initial analysis
        setShowSuggestions(true);
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

  const handleSuggestionClick = async (prompt: string) => {
    setShowSuggestions(false);
    await sendMessageWithContent(prompt);
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

    // Save user message to database
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
        // Save assistant response to database
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
    setShowSuggestions(false); // Hide suggestions when user sends a message
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
  return (
    <Card className="h-[500px] lg:h-[600px] flex flex-col overflow-hidden shadow-lg">
      {/* Header */}
      <div className="p-4 flex items-center gap-3 rounded-t-lg bg-accent">
        <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center overflow-hidden">
          <img src={atlasMascot} alt="Atlas" className="h-8 w-8 object-contain" />
        </div>
        <div>
          <h2 className="font-semibold text-primary-foreground">Atlas</h2>
          <p className="text-sm text-primary-foreground/80">AI Veterinary Assistant</p>
        </div>
      </div>

      {/* Chat Area */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {/* Initial Loading State */}
        {(isTranscribing || isAnalyzing) && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full py-8 animate-fade-in">
            <div className="relative mb-4">
              <img src={atlasMascot} alt="Atlas thinking" className="h-24 w-24 object-contain animate-pulse" />
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
                <div className="flex gap-1">
                  <div
                    className="h-2 w-2 rounded-full bg-primary animate-bounce"
                    style={{
                      animationDelay: "0ms",
                    }}
                  />
                  <div
                    className="h-2 w-2 rounded-full bg-primary animate-bounce"
                    style={{
                      animationDelay: "150ms",
                    }}
                  />
                  <div
                    className="h-2 w-2 rounded-full bg-primary animate-bounce"
                    style={{
                      animationDelay: "300ms",
                    }}
                  />
                </div>
              </div>
            </div>
            <p className="text-muted-foreground text-center text-sm">
              {isTranscribing ? "Processing your recording..." : "Analyzing the case..."}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">Atlas is reviewing the details</p>
          </div>
        )}

        {/* Messages */}
        <div className="space-y-3">
          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${message.role === "user" ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md"}`}
              >
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {message.role === "user" ? message.content : stripMarkdown(message.content)}
                </p>
              </div>
            </div>
          ))}

          {/* Suggestion Bubbles */}
          {showSuggestions && !isLoading && (
            <div className="flex flex-wrap gap-2 mt-3 px-1">
              {suggestions.map((suggestion) => (
                <Button
                  key={suggestion.id}
                  variant="outline"
                  size="sm"
                  className="rounded-full text-xs bg-accent/10 hover:bg-accent/20 border-accent/30 text-foreground"
                  onClick={() => handleSuggestionClick(suggestion.prompt)}
                >
                  {suggestion.label}
                </Button>
              ))}
            </div>
          )}

          {/* Loading indicator for follow-up */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-2.5">
                <div className="flex gap-1">
                  <div
                    className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce"
                    style={{
                      animationDelay: "0ms",
                    }}
                  />
                  <div
                    className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce"
                    style={{
                      animationDelay: "150ms",
                    }}
                  />
                  <div
                    className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce"
                    style={{
                      animationDelay: "300ms",
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-3 border-t border-border bg-card rounded-b-lg">
        <div className="flex gap-2 items-center">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask Atlas a question..."
            disabled={isLoading || isTranscribing || isAnalyzing || isRecording}
            className="flex-1 text-sm"
          />

          <VoiceRecorder
            onTranscriptionComplete={handleVoiceTranscription}
            onError={handleVoiceError}
            isDisabled={isLoading || isTranscribing || isAnalyzing}
            isRecording={isRecording}
            onRecordingChange={setIsRecording}
            inline={true}
            consultId={consultId}
          />

          <Button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading || isTranscribing || isAnalyzing || isRecording}
            size="icon"
            className="bg-accent"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </Card>
  );
}
