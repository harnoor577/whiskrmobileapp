import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface TicketDetailDialogProps {
  ticketId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function TicketDetailDialog({ ticketId, isOpen, onClose }: TicketDetailDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [replyText, setReplyText] = useState("");

  const { data: ticket, isLoading: loadingTicket } = useQuery({
    queryKey: ['support-ticket', ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*, clinics(name)')
        .eq('id', ticketId)
        .single();

      if (error || !data) throw error;

      const { data: profile } = await supabase
        .from('profiles')
        .select('name, email')
        .eq('user_id', data.user_id)
        .single();

      // Get closed_by user if available
      let closedByName = null;
      if (data.closed_by) {
        const { data: closedByProfile } = await supabase
          .from('profiles')
          .select('name')
          .eq('user_id', data.closed_by)
          .single();
        closedByName = closedByProfile?.name;
      }

      return { ...data, profiles: profile, closed_by_name: closedByName };
    },
    enabled: isOpen && !!ticketId,
  });

  const { data: replies, isLoading: loadingReplies } = useQuery({
    queryKey: ['support-ticket-replies', ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_ticket_replies')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const repliesWithProfiles = await Promise.all(
        (data || []).map(async (reply) => {
          // Try to get profile from profiles table
          const { data: profile } = await supabase
            .from('profiles')
            .select('name, email')
            .eq('user_id', reply.user_id)
            .single();
          
          // Fallback: show role-based label if no profile
          let authorName = profile?.name;
          if (!authorName) {
            authorName = reply.is_support_reply ? 'Support' : 'User';
          }
          
          return { ...reply, author_name: authorName };
        })
      );

      return repliesWithProfiles;
    },
    enabled: isOpen && !!ticketId,
  });

  const addReply = useMutation({
    mutationFn: async () => {
      if (!user || !replyText.trim()) throw new Error('Reply cannot be empty');

      // Check if user is support agent or super admin
      const { data: isSuperAdmin } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'super_admin')
        .single();

      const { data: isSupportAgent } = await supabase
        .from('support_agents')
        .select('id')
        .eq('user_id', user.id)
        .single();

      const isSupportReply = !!isSuperAdmin || !!isSupportAgent;

      const { error } = await supabase
        .from('support_ticket_replies')
        .insert({
          ticket_id: ticketId,
          user_id: user.id,
          message: replyText,
          is_support_reply: isSupportReply,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-ticket-replies', ticketId] });
      toast({ title: "Reply sent successfully" });
      setReplyText("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send reply",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    // Mark ticket as read when dialog opens
    const markRead = async () => {
      if (!user || !ticketId || !isOpen) return;
      await supabase
        .from('support_ticket_reads')
        .upsert({ ticket_id: ticketId, user_id: user.id, last_read_at: new Date().toISOString() }, { onConflict: 'ticket_id,user_id' });
    };
    markRead();
  }, [user, ticketId, isOpen]);

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        onClose();
      } else {
        // refresh reads
        if (user && ticketId) {
          supabase
            .from('support_ticket_reads')
            .upsert({ ticket_id: ticketId, user_id: user.id, last_read_at: new Date().toISOString() }, { onConflict: 'ticket_id,user_id' });
        }
      }
    }}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Support Ticket Details</DialogTitle>
        </DialogHeader>

        {loadingTicket ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : ticket ? (
          <div className="space-y-6">
            {/* Ticket Header */}
            <Card className="p-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <h3 className="text-lg font-semibold">{ticket.subject}</h3>
                  <div className="flex gap-2">
                    <Badge variant="secondary" className="capitalize">{ticket.status}</Badge>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <div><strong>From:</strong> {ticket.profiles?.name} ({ticket.profiles?.email})</div>
                  <div><strong>Clinic:</strong> {ticket.clinics.name}</div>
                  <div><strong>Priority:</strong> <Badge variant="outline" className="capitalize">{ticket.priority}</Badge></div>
                  <div><strong>Created:</strong> {format(new Date(ticket.created_at), 'MMM d, yyyy h:mm a')}</div>
                  {(ticket.status === 'resolved' || ticket.status === 'closed') && ticket.closed_by_name && (
                    <div><strong>Closed by:</strong> {ticket.closed_by_name}</div>
                  )}
                </div>
                <div className="pt-2 border-t">
                  <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
                </div>
              </div>
            </Card>

            {/* Conversation Thread */}
            <div className="space-y-4">
              <h4 className="font-semibold text-sm text-muted-foreground">Conversation</h4>
              {loadingReplies ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : replies && replies.length > 0 ? (
                <div className="space-y-3">
                  {replies.map((reply) => (
                    <Card
                      key={reply.id}
                      className={`p-4 ${reply.is_support_reply ? 'bg-primary/5 border-primary/20' : 'bg-muted/30'}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{reply.author_name}</span>
                          {reply.is_support_reply && (
                            <Badge variant="secondary" className="text-xs">Support</Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(reply.created_at), 'MMM d, h:mm a')}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{reply.message}</p>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No replies yet</p>
              )}
            </div>

            {/* Reply Form */}
            <div className="space-y-3 border-t pt-4">
              <Textarea
                placeholder="Type your reply..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={4}
                className="resize-none"
              />
              <div className="flex justify-end">
                <Button
                  onClick={() => addReply.mutate()}
                  disabled={!replyText.trim() || addReply.isPending}
                >
                  {addReply.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Send Reply
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-center py-8 text-muted-foreground">Ticket not found</p>
        )}
      </DialogContent>
    </Dialog>
  );
}