import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { StickyNote } from "lucide-react";
import { AtlasEye } from "@/components/ui/AtlasEye";
import { stripMarkdown } from "@/utils/stripMarkdown";

interface Message {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

interface AtlasHistoryProps {
  consultId: string;
  onAddToCaseNotes?: (content: string) => void;
  onMessageCountChange?: (count: number) => void;
}

export function AtlasHistory({ consultId, onAddToCaseNotes, onMessageCountChange }: AtlasHistoryProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("id, role, content, created_at")
        .eq("consult_id", consultId)
        .order("created_at", { ascending: true });

      if (!error && data) {
        setMessages(data);
        onMessageCountChange?.(data.length);
      }
      setIsLoading(false);
    };

    fetchMessages();
  }, [consultId, onMessageCountChange]);

  if (isLoading) {
    return (
      <div className="h-[400px] flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading conversation...</div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center">
        <div className="text-muted-foreground text-sm text-center">
          <AtlasEye size="sm" blink className="mx-auto mb-2 opacity-50" />
          No AI conversation for this consult.
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px] p-4">
      <div className="space-y-3">
        {messages.map((message) =>
          message.role === "system" ? (
            <div key={message.id} className="flex justify-center py-2">
              <div className="text-xs text-muted-foreground border-y border-dashed border-muted-foreground/30 py-2 px-4 w-full text-center">
                {message.content}
              </div>
            </div>
          ) : (
            <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 relative group ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-muted rounded-bl-md"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {message.role === "user" ? message.content : stripMarkdown(message.content)}
                </p>
                {message.role === "assistant" && onAddToCaseNotes && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute -bottom-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity bg-background shadow-sm border"
                          onClick={() => onAddToCaseNotes(stripMarkdown(message.content))}
                        >
                          <StickyNote className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p>Add to Case Notes</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
          ),
        )}
      </div>
    </ScrollArea>
  );
}
