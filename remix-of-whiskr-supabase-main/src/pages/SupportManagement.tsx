import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserPlus, Users, MessageSquare, X } from "lucide-react";
import { SupportManagementSkeleton } from '@/components/support/SupportManagementSkeleton';
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { TicketDetailDialog } from "@/components/support/TicketDetailDialog";

export default function SupportManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [filterStatus, setFilterStatus] = useState('all');
  const [agentEmail, setAgentEmail] = useState('');
  const [showAgentDialog, setShowAgentDialog] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  const { data: isSuperAdminOrAgent, isLoading: loadingRole } = useQuery({
    queryKey: ['is-super-admin-or-agent', user?.id],
    queryFn: async () => {
      if (!user) return false;
      
      // Check if super admin
      const { data: superAdminData, error: superAdminError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'super_admin')
        .single();
      
      if (!superAdminError && superAdminData) return { isSuperAdmin: true, isAgent: false };
      
      // Check if support agent
      const { data: agentData, error: agentError } = await supabase
        .from('support_agents')
        .select('id')
        .eq('user_id', user.id)
        .single();
      
      if (!agentError && agentData) return { isSuperAdmin: false, isAgent: true };
      
      return false;
    },
    enabled: !!user,
  });

  const isSuperAdmin = isSuperAdminOrAgent && typeof isSuperAdminOrAgent === 'object' && isSuperAdminOrAgent.isSuperAdmin;

  const { data: tickets, isLoading } = useQuery({
    queryKey: ['all-support-tickets', filterStatus],
    queryFn: async () => {
      let query = supabase.from('support_tickets').select('*, clinics(name)').order('created_at', { ascending: false });
      
      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }
      
      const { data: tickets, error } = await query;
      if (error || !tickets) throw error;

      const ticketsWithProfiles = await Promise.all(
        tickets.map(async (ticket) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('name, email')
            .eq('user_id', ticket.user_id)
            .single();
          return { ...ticket, profiles: profile };
        })
      );
      
      return ticketsWithProfiles;
    },
    enabled: !!isSuperAdmin,
  });

  const { data: agents } = useQuery({
    queryKey: ['support-agents'],
    queryFn: async () => {
      const { data: agents, error } = await supabase
        .from('support_agents')
        .select('*');
      
      if (error || !agents) throw error;

      const agentsWithProfiles = await Promise.all(
        agents.map(async (agent) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('name, email, user_id')
            .eq('user_id', agent.user_id)
            .single();
          return { ...agent, profiles: profile };
        })
      );
      
      return agentsWithProfiles;
    },
    enabled: !!isSuperAdmin,
  });

  const assignTicket = useMutation({
    mutationFn: async ({ ticketId, agentId }: { ticketId: string; agentId: string | null }) => {
      const { error } = await supabase
        .from('support_tickets')
        .update({ assigned_to: agentId })
        .eq('id', ticketId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-support-tickets'] });
      toast({ title: "Ticket assigned" });
    },
  });

  const updateTicketStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: any = { status };
      if (status === 'resolved' || status === 'closed') {
        updates.resolved_at = new Date().toISOString();
        updates.closed_by = user?.id;
        updates.closed_at = new Date().toISOString();
      }
      
      const { error } = await supabase
        .from('support_tickets')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-support-tickets'] });
      toast({ title: "Ticket updated" });
    },
  });

  const updateRefundStatus = useMutation({
    mutationFn: async ({ ticketId, refundStatus }: { ticketId: string; refundStatus: string }) => {
      // If status is 'processed', actually process the refund through Stripe
      if (refundStatus === 'processed') {
        const { data, error } = await supabase.functions.invoke('process-stripe-refund', {
          body: { ticketId },
        });
        
        if (error) throw error;
        
        if (data?.success) {
          toast({ 
            title: "Refund processed successfully", 
            description: `${data.refund.currency} ${data.refund.amount} refunded. Transaction ID: ${data.refund.id}` 
          });
        }
      } else {
        // For other statuses, just update the status and send email
        const { error } = await supabase
          .from('support_tickets')
          .update({ refund_status: refundStatus })
          .eq('id', ticketId);

        if (error) throw error;

        // Send email notification
        await supabase.functions.invoke('send-refund-status-email', {
          body: { ticketId, newStatus: refundStatus },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-support-tickets'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update refund status",
        variant: "destructive",
      });
    },
  });

  const removeAgent = useMutation({
    mutationFn: async (agentId: string) => {
      const { error } = await supabase
        .from('support_agents')
        .delete()
        .eq('id', agentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-agents'] });
      toast({ title: "Support agent removed" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove support agent",
        variant: "destructive",
      });
    },
  });

  const addAgent = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      
      // Validate email format first
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(agentEmail)) {
        throw new Error('Please enter a valid email address');
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('user_id, name')
        .eq('email', agentEmail)
        .single();

      if (profileError || !profile) {
        throw new Error('This email is not registered. The person must sign up for an account first before being added as a support agent.');
      }

      const { error } = await supabase
        .from('support_agents')
        .insert({
          user_id: profile.user_id,
          added_by: user.id,
        });

      if (error) throw error;

      // Send email notification to the support agent
      await supabase.functions.invoke('notify-support-agent', {
        body: {
          agentEmail,
          agentName: profile.name || agentEmail,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-agents'] });
      toast({ title: "Support agent added" });
      setAgentEmail('');
      setShowAgentDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add support agent",
        variant: "destructive",
      });
    },
  });

  if (loadingRole) {
    return <SupportManagementSkeleton />;
  }

  if (!isSuperAdminOrAgent) {
    return (
      <div className="container mx-auto p-6 max-w-5xl">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Access denied. Support agent or admin privileges required.</p>
            <Button className="mt-4" onClick={() => navigate('/dashboard')}>
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Support Management</h1>
          <p className="text-muted-foreground">Manage support tickets and agents</p>
        </div>
        {isSuperAdmin && (
          <Dialog open={showAgentDialog} onOpenChange={setShowAgentDialog}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4 mr-2" />
                Add Support Agent
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Support Agent</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <Input
                  placeholder="Enter user email"
                  value={agentEmail}
                  onChange={(e) => setAgentEmail(e.target.value)}
                />
                <Button onClick={() => addAgent.mutate()} disabled={!agentEmail || addAgent.isPending}>
                  {addAgent.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Add Agent
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isSuperAdmin && agents && agents.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Support Agents ({agents.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {agents.map((agent) => (
                <div key={agent.id} className="flex items-center gap-2 bg-secondary px-3 py-2 rounded-full">
                  <span className="text-sm font-medium">
                    {agent.profiles.name} ({agent.profiles.email})
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => {
                      if (confirm(`Remove ${agent.profiles.name} as a support agent?`)) {
                        removeAgent.mutate(agent.id);
                      }
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mb-4">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tickets</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <SupportManagementSkeleton />
      ) : (
        <div className="space-y-4">
          {tickets?.map((ticket) => (
            <Card key={ticket.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <CardTitle>{ticket.subject}</CardTitle>
                    <div className="flex gap-2 items-center flex-wrap">
                      <Badge variant="outline" className="capitalize">{ticket.priority}</Badge>
                      <Badge variant="secondary" className="capitalize">{ticket.status}</Badge>
                      {ticket.category === 'billing_refund' && (
                        <Badge className="bg-purple-500 hover:bg-purple-600">Refund</Badge>
                      )}
                      {ticket.tags?.map((tag: string) => (
                        <Badge key={tag} variant="outline">{tag}</Badge>
                      ))}
                      {ticket.assigned_to && (
                        <Badge variant="default" className="capitalize">
                          Assigned
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <div><strong>From:</strong> {ticket.profiles.name} ({ticket.profiles.email})</div>
                      <div><strong>Clinic:</strong> {ticket.clinics.name}</div>
                      <div><strong>Created:</strong> {format(new Date(ticket.created_at), 'MMM d, yyyy h:mm a')}</div>
                      {ticket.assigned_to && agents && (
                        <div>
                          <strong>Assigned to:</strong>{' '}
                          {agents.find(a => a.profiles?.user_id === ticket.assigned_to)?.profiles?.name || 'Unknown'}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Select
                      value={ticket.assigned_to || 'unassigned'}
                      onValueChange={(agentId) => {
                        assignTicket.mutate({ 
                          ticketId: ticket.id, 
                          agentId: agentId === 'unassigned' ? null : agentId 
                        });
                      }}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Assign to..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {agents?.map((agent) => (
                          <SelectItem key={agent.id} value={agent.profiles.user_id}>
                            {agent.profiles.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={ticket.status}
                      onValueChange={(status) => updateTicketStatus.mutate({ id: ticket.id, status })}
                    >
                      <SelectTrigger className="w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                    {ticket.category === 'billing_refund' && (
                      <Select
                        value={ticket.refund_status || 'none'}
                        onValueChange={(refundStatus) => {
                          if (refundStatus !== 'none') {
                            updateRefundStatus.mutate({ ticketId: ticket.id, refundStatus });
                          }
                        }}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Refund Status..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Set Status...</SelectItem>
                          <SelectItem value="under_review">Under Review</SelectItem>
                          <SelectItem value="approved">Approved</SelectItem>
                          <SelectItem value="declined">Declined</SelectItem>
                          <SelectItem value="processed">Processed</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
                <div className="mt-4">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedTicketId(ticket.id)}
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    View Conversation
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <TicketDetailDialog
        ticketId={selectedTicketId || ''}
        isOpen={!!selectedTicketId}
        onClose={() => setSelectedTicketId(null)}
      />
    </div>
  );
}