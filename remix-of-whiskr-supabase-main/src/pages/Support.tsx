import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, MessageSquare, CheckCircle2, Clock, AlertCircle, Mail, Phone, CreditCard } from "lucide-react";
import { SupportSkeleton } from '@/components/support/SupportSkeleton';
import { format } from "date-fns";
import { TicketDetailDialog } from "@/components/support/TicketDetailDialog";
import { RefundRequestDialog } from "@/components/support/RefundRequestDialog";

export default function Support() {
  const { clinicId, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [relatedConsultId, setRelatedConsultId] = useState<string>('');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [showRefundDialog, setShowRefundDialog] = useState(false);

  const { data: clinic } = useQuery({
    queryKey: ['clinic', clinicId],
    queryFn: async () => {
      if (!clinicId) return null;
      const { data, error } = await supabase
        .from('clinics')
        .select('subscription_tier')
        .eq('id', clinicId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!clinicId,
  });

  const hasImmediateSupport = clinic?.subscription_tier === 'professional' || clinic?.subscription_tier === 'enterprise';

  const { data: tickets, isLoading } = useQuery({
    queryKey: ['support-tickets', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const createTicket = useMutation({
    mutationFn: async () => {
      if (!clinicId || !user) throw new Error('Not authenticated');
      
      const { data: ticket, error: ticketError } = await supabase
        .from('support_tickets')
        .insert({
          clinic_id: clinicId,
          user_id: user.id,
          subject,
          description,
          priority,
          related_consult_id: relatedConsultId || null,
        })
        .select()
        .single();

      if (ticketError) throw ticketError;

      // Send notification email
      await supabase.functions.invoke('send-support-notification', {
        body: { ticketId: ticket.id },
      });

      return ticket;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      toast({
        title: "Ticket created",
        description: "Our support team will review your ticket shortly.",
      });
      setSubject('');
      setDescription('');
      setPriority('medium');
      setRelatedConsultId('');
      setShowNewTicket(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create ticket. Please try again.",
        variant: "destructive",
      });
      console.error('Error creating ticket:', error);
    },
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <AlertCircle className="h-4 w-4" />;
      case 'pending':
        return <Clock className="h-4 w-4" />;
      case 'resolved':
      case 'closed':
        return <CheckCircle2 className="h-4 w-4" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-blue-500';
      case 'pending':
        return 'bg-yellow-500';
      case 'resolved':
        return 'bg-green-500';
      case 'closed':
        return 'bg-gray-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'destructive';
      case 'high':
        return 'default';
      case 'medium':
        return 'secondary';
      case 'low':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const totalUnread = useMemo(() => Object.values(unreadCounts).reduce((a, b) => a + b, 0), [unreadCounts]);

  useEffect(() => {
    const loadUnread = async () => {
      if (!user || !tickets || tickets.length === 0) return;
      const counts: Record<string, number> = {};
      for (const t of tickets) {
        // Get last_read_at for this ticket
        const { data: readRow } = await supabase
          .from('support_ticket_reads')
          .select('last_read_at')
          .eq('ticket_id', t.id)
          .eq('user_id', user.id)
          .maybeSingle();
        const lastReadAt = readRow?.last_read_at || '1970-01-01T00:00:00Z';
        // Count unread support replies after last_read_at
        const { count } = await supabase
          .from('support_ticket_replies')
          .select('id', { count: 'exact', head: true })
          .eq('ticket_id', t.id)
          .eq('is_support_reply', true)
          .gt('created_at', lastReadAt);
        counts[t.id] = count || 0;
      }
      setUnreadCounts(counts);
    };
    loadUnread();
  }, [user, tickets]);

  // Realtime: bump counts when new support reply arrives
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('support-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_ticket_replies' }, async (payload: any) => {
        if (!payload.new.is_support_reply) return;
        // Fetch ticket to ensure it's owned by current user
        const { data: ticket } = await supabase
          .from('support_tickets')
          .select('id, user_id')
          .eq('id', payload.new.ticket_id)
          .single();
        if (ticket?.user_id !== user.id) return;
        setUnreadCounts(prev => ({ ...prev, [payload.new.ticket_id]: (prev[payload.new.ticket_id] || 0) + 1 }));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  if (isLoading) {
    return <SupportSkeleton />;
  }

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            Support
            {totalUnread > 0 && (
              <Badge variant="destructive" className="ml-2">{totalUnread} new</Badge>
            )}
          </h1>
          <p className="text-muted-foreground">Get help from our support team</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowRefundDialog(true)}>
            <CreditCard className="h-4 w-4 mr-2" />
            Request Refund
          </Button>
          <Button onClick={() => setShowNewTicket(!showNewTicket)}>
            <Plus className="h-4 w-4 mr-2" />
            New Ticket
          </Button>
        </div>
      </div>

      {/* Contact Support Section - Professional & Enterprise Only */}
      {hasImmediateSupport && (
        <Card className="mb-6 bg-muted/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Need Immediate Help?
            </CardTitle>
            <CardDescription>Contact our support team directly</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-background">
                <Mail className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Email Support</p>
                  <a href="mailto:support@whiskr.ai" className="text-sm text-primary hover:underline">
                    support@whiskr.ai
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-background">
                <Phone className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Phone Support</p>
                  <a href="tel:+15108772735" className="text-sm text-primary hover:underline">
                    (510) 877-2735
                  </a>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {showNewTicket && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Create Support Ticket</CardTitle>
            <CardDescription>Describe your issue and we'll get back to you</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Subject</label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Brief description of your issue"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Priority</label>
              <Select value={priority} onValueChange={(v: any) => setPriority(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Description</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide detailed information about your issue"
                className="min-h-[150px]"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Related Consultation (Optional)</label>
              <Input
                value={relatedConsultId}
                onChange={(e) => setRelatedConsultId(e.target.value)}
                placeholder="Consultation ID if your issue is related to a specific case"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Linking a consultation helps support access only the relevant data
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => createTicket.mutate()}
                disabled={!subject || !description || createTicket.isPending}
              >
                {createTicket.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Submit Ticket
              </Button>
              <Button variant="outline" onClick={() => setShowNewTicket(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {tickets?.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No support tickets yet</p>
              <Button className="mt-4" onClick={() => setShowNewTicket(true)}>
                Create your first ticket
              </Button>
            </CardContent>
          </Card>
        ) : (
          tickets?.map((ticket) => (
            <Card 
              key={ticket.id} 
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => setSelectedTicketId(ticket.id)}
            >
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <CardTitle className="text-xl flex items-center gap-2">
                      {ticket.subject}
                      {ticket.category === 'billing_refund' && (
                        <Badge className="bg-purple-500 hover:bg-purple-600 text-xs">Refund</Badge>
                      )}
                      {(unreadCounts[ticket.id] || 0) > 0 && (
                        <Badge variant="destructive" className="text-xs">{unreadCounts[ticket.id]} new</Badge>
                      )}
                    </CardTitle>
                    <div className="flex gap-2 items-center flex-wrap">
                      <Badge variant={getPriorityColor(ticket.priority)} className="capitalize">
                        {ticket.priority}
                      </Badge>
                      <Badge variant="outline" className="capitalize">
                        <span className={`w-2 h-2 rounded-full ${getStatusColor(ticket.status)} mr-1`} />
                        {ticket.status}
                      </Badge>
                      {ticket.tags && ticket.tags.length > 0 && ticket.tags.map((tag: string) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {format(new Date(ticket.created_at), 'MMM d, yyyy')}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">{ticket.description}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={(e) => {
                  e.stopPropagation();
                  setSelectedTicketId(ticket.id);
                }}>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  View Conversation
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Ticket Detail Dialog */}
      <TicketDetailDialog 
        ticketId={selectedTicketId}
        isOpen={!!selectedTicketId}
        onClose={() => {
          if (selectedTicketId) {
            setUnreadCounts(prev => ({ ...prev, [selectedTicketId]: 0 }));
          }
          setSelectedTicketId(null);
        }}
      />

      {/* Refund Request Dialog */}
      <RefundRequestDialog
        isOpen={showRefundDialog}
        onClose={() => setShowRefundDialog(false)}
      />
    </div>
  );
}