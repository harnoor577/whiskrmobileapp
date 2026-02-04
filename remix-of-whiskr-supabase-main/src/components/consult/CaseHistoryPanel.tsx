import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { History, CheckCircle2, FileEdit, Loader2 } from "lucide-react";
import { formatInLocalTime } from "@/lib/timezone";

interface TimelineEvent {
  event: string;
  by: string;
  at: string;
  version?: number;
  from_version?: number;
  to_version?: number;
}

interface CaseHistoryPanelProps {
  consultId: string;
  currentVersion?: number;
}

export function CaseHistoryPanel({ consultId, currentVersion }: CaseHistoryPanelProps) {
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [userNames, setUserNames] = useState<Record<string, string>>({});

  useEffect(() => {
    loadHistory();
  }, [consultId]);

  const loadHistory = async () => {
    try {
      const { data: consult } = await supabase
        .from("consults")
        .select("version, created_at, finalized_at, finalized_by")
        .eq("id", consultId)
        .single();

      if (!consult) return;

      const events: TimelineEvent[] = [];

      // Add created event
      events.push({
        event: "created",
        by: "",
        at: consult.created_at,
        version: 1,
      });

      // Add finalized event if applicable
      if (consult.finalized_at) {
        events.push({
          event: "finalized",
          by: consult.finalized_by || "",
          at: consult.finalized_at,
          version: consult.version || 1,
        });
      }

      // Sort by timestamp
      events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

      setTimeline(events);

      // Fetch user names
      const userIds = events.map((e) => e.by).filter(Boolean);
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, name")
          .in("user_id", userIds);

        if (profiles) {
          const names: Record<string, string> = {};
          profiles.forEach((p) => {
            names[p.user_id] = p.name;
          });
          setUserNames(names);
        }
      }
    } catch (error) {
      console.error("Error loading case history:", error);
    } finally {
      setLoading(false);
    }
  };

  const getEventIcon = (event: string) => {
    switch (event) {
      case "finalized":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "unfinalized":
        return <FileEdit className="h-4 w-4 text-amber-600" />;
      case "created":
        return <History className="h-4 w-4 text-blue-600" />;
      default:
        return <History className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getEventLabel = (event: string) => {
    switch (event) {
      case "finalized":
        return "Finalized";
      case "unfinalized":
        return "Unfinalized (returned to Draft)";
      case "created":
        return "Created";
      case "regen":
        return "AI Updated";
      default:
        return event;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm text-muted-foreground">Loading history...</span>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[300px]">
      <div className="space-y-3">
        {timeline.map((event, idx) => (
          <div key={idx} className="flex gap-3 pb-3 border-b last:border-0">
            <div className="mt-0.5">{getEventIcon(event.event)}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium text-sm">{getEventLabel(event.event)}</div>
                {event.version && (
                  <Badge variant="outline" className="text-xs">
                    v{event.version}
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {formatInLocalTime(event.at, "MMM d, yyyy 'at' h:mm a")}
              </div>
              {event.by && userNames[event.by] && (
                <div className="text-xs text-muted-foreground">
                  by {userNames[event.by]}
                </div>
              )}
              {event.from_version && event.to_version && (
                <div className="text-xs text-muted-foreground">
                  v{event.from_version} → v{event.to_version}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
